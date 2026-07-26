// Integration Service · 接口适配器业务层
// 单表操作，Service 层目前只是 Repository 的薄包装
// 后续接真实邮件/飞书接口时，业务逻辑会加到这里

import { IntegrationRepository } from "../repositories/integrationRepository";
import type {
  IntegrationAdapter,
  IntegrationAuthType,
  IntegrationSecretKey,
  UpsertIntegrationInput,
} from "../../renderer/types";
import type { StoredIntegrationConfig } from "../repositories/integrationRepository";
import {
  applyIntegrationSecrets,
  deleteIntegrationSecrets,
  readIntegrationSecrets,
} from "./integrationSecretStore";

export function getAllIntegrations(): IntegrationAdapter[] {
  return IntegrationRepository.list();
}

export function getIntegrationById(id: string): IntegrationAdapter | null {
  return IntegrationRepository.findById(id);
}

const AUTH_TYPES: IntegrationAuthType[] = ["none", "api_key", "oauth2", "basic", "webhook"];

function normalizePort(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${label}必须在 1–65535 之间`);
  }
  return value;
}

function validateUrl(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${label}格式无效`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label}仅支持 http/https`);
  }
  return trimmed;
}

function normalizeSecretChanges(input: UpsertIntegrationInput): Partial<Record<IntegrationSecretKey, string | null>> {
  const changes: Partial<Record<IntegrationSecretKey, string | null>> = { ...input.secrets };
  const legacyWebhook = input.config.webhookUrl.trim();
  if (legacyWebhook) changes.webhookUrl = legacyWebhook;
  if (input.config.mode === "feishu_webhook" && typeof changes.webhookUrl === "string" && changes.webhookUrl.trim()) {
    const value = validateUrl(changes.webhookUrl, "飞书 Webhook URL");
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.hostname !== "open.feishu.cn" || !parsed.pathname.startsWith("/open-apis/bot/v2/hook/")) {
      throw new Error("飞书 Webhook URL 必须是 open.feishu.cn 的群机器人地址");
    }
    changes.webhookUrl = value;
  }
  return changes;
}

const SECRET_KEYS: IntegrationSecretKey[] = [
  "apiKey", "clientId", "clientSecret", "username", "password", "token", "webhookUrl",
];

function configuredSecrets(secrets: Partial<Record<IntegrationSecretKey, string>>): Record<IntegrationSecretKey, boolean> {
  return Object.fromEntries(SECRET_KEYS.map((key) => [key, Boolean(secrets[key])])) as Record<IntegrationSecretKey, boolean>;
}

function buildStoredConfig(input: UpsertIntegrationInput, secrets: Partial<Record<IntegrationSecretKey, string>>): StoredIntegrationConfig {
  if (!AUTH_TYPES.includes(input.config.authType)) throw new Error("认证方式无效");
  const targets = (input.config.targets ?? []).slice(0, 20).map((target) => ({
    id: target.id.trim(),
    name: target.name.trim(),
    kind: target.kind,
  })).filter((target) => target.id && target.name && (target.kind === "chat" || target.kind === "webhook"));
  return {
    provider: input.config.provider.trim(),
    account: input.config.account.trim(),
    endpoint: validateUrl(input.config.endpoint, "Base URL"),
    imapHost: input.config.imapHost.trim(),
    imapPort: normalizePort(input.config.imapPort, "IMAP 端口"),
    smtpHost: input.config.smtpHost.trim(),
    smtpPort: normalizePort(input.config.smtpPort, "SMTP 端口"),
    // Webhook URL 属于可发送外部消息的敏感凭据，只能进入 safeStorage。
    webhookUrl: "",
    authType: input.config.authType,
    mode: input.config.mode ?? "legacy",
    targets,
    secretConfigured: configuredSecrets(secrets),
  };
}

function baseAdapter(id: string, input: UpsertIntegrationInput): IntegrationAdapter {
  const name = input.name.trim();
  if (!name) throw new Error("适配器名称不能为空");
  return {
    id,
    type: input.type,
    name,
    description: input.description.trim(),
    status: "disconnected",
    lastSync: null,
    eventsToday: 0,
    config: {
      ...input.config,
      webhookUrl: "",
      mode: input.config.mode ?? "legacy",
      targets: input.config.targets ?? [],
      secretConfigured: {
        apiKey: false,
        clientId: false,
        clientSecret: false,
        username: false,
        password: false,
        token: false,
        webhookUrl: false,
      },
    },
  };
}

export function createIntegration(input: UpsertIntegrationInput): IntegrationAdapter {
  const id = `int-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const adapter = baseAdapter(id, input);
  const secrets = applyIntegrationSecrets(id, normalizeSecretChanges(input));
  adapter.config.secretConfigured = configuredSecrets(secrets);
  IntegrationRepository.upsert(adapter, buildStoredConfig(input, secrets));
  return IntegrationRepository.findById(id)!;
}

export function updateIntegration(
  id: string,
  input: UpsertIntegrationInput,
): IntegrationAdapter {
  const existing = IntegrationRepository.findById(id);
  if (!existing) throw new Error("适配器不存在");
  const adapter = baseAdapter(id, input);
  const credentialsChanged = Object.values(input.secrets ?? {}).some((value) => value === null || Boolean(value?.trim()));
  adapter.status = credentialsChanged || input.config.mode !== existing.config.mode
    ? "disconnected"
    : existing.status;
  adapter.lastSync = existing.lastSync;
  adapter.eventsToday = existing.eventsToday;
  const secrets = applyIntegrationSecrets(id, normalizeSecretChanges(input));
  adapter.config.secretConfigured = configuredSecrets(secrets);
  IntegrationRepository.upsert(adapter, buildStoredConfig(input, secrets));
  return IntegrationRepository.findById(id)!;
}

export function deleteIntegration(id: string): boolean {
  const deleted = IntegrationRepository.delete(id);
  if (deleted) deleteIntegrationSecrets(id);
  return deleted;
}

/** 把旧版 SQLite JSON 中的明文凭据迁入主进程安全存储，并清除原字段。 */
export function migrateLegacyIntegrationSecrets(decode: (value: string) => string = (value) => value): number {
  let migrated = 0;
  for (const { adapter, config } of IntegrationRepository.listStored()) {
    const legacy = Object.fromEntries(
      Object.entries(config.secrets ?? {}).map(([key, value]) => [key, decode(value)]),
    ) as Partial<Record<IntegrationSecretKey, string>>;
    if (config.webhookUrl) legacy.webhookUrl = config.webhookUrl;
    if (Object.keys(legacy).length === 0) continue;
    const secrets = applyIntegrationSecrets(adapter.id, legacy);
    const sanitized: StoredIntegrationConfig = {
      ...config,
      webhookUrl: "",
      secretConfigured: configuredSecrets(secrets),
      secrets: undefined,
    };
    IntegrationRepository.upsert({
      ...adapter,
      config: { ...adapter.config, webhookUrl: "", secretConfigured: sanitized.secretConfigured },
    }, sanitized);
    migrated += 1;
  }
  return migrated;
}

export function getIntegrationSecrets(id: string): Partial<Record<IntegrationSecretKey, string>> {
  if (!IntegrationRepository.findById(id)) throw new Error("适配器不存在");
  return readIntegrationSecrets(id);
}

export function setIntegrationStatus(id: string, status: IntegrationAdapter["status"]): void {
  IntegrationRepository.updateStatus(id, status);
}
