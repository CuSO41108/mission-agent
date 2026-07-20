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

function buildStoredConfig(
  input: UpsertIntegrationInput,
  previousSecrets: Partial<Record<IntegrationSecretKey, string>> = {},
): StoredIntegrationConfig {
  if (!AUTH_TYPES.includes(input.config.authType)) throw new Error("认证方式无效");
  const secrets = { ...previousSecrets };
  for (const [key, value] of Object.entries(input.secrets ?? {}) as Array<
    [IntegrationSecretKey, string | null]
  >) {
    if (value === null) delete secrets[key];
    else if (value.trim()) secrets[key] = value;
  }
  return {
    provider: input.config.provider.trim(),
    account: input.config.account.trim(),
    endpoint: validateUrl(input.config.endpoint, "Base URL"),
    imapHost: input.config.imapHost.trim(),
    imapPort: normalizePort(input.config.imapPort, "IMAP 端口"),
    smtpHost: input.config.smtpHost.trim(),
    smtpPort: normalizePort(input.config.smtpPort, "SMTP 端口"),
    webhookUrl: validateUrl(input.config.webhookUrl, "Webhook URL"),
    authType: input.config.authType,
    secrets,
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
      secretConfigured: {
        apiKey: false,
        clientId: false,
        clientSecret: false,
        username: false,
        password: false,
        token: false,
      },
    },
  };
}

export function createIntegration(input: UpsertIntegrationInput): IntegrationAdapter {
  const id = `int-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const adapter = baseAdapter(id, input);
  IntegrationRepository.upsert(adapter, buildStoredConfig(input));
  return IntegrationRepository.findById(id)!;
}

export function updateIntegration(
  id: string,
  input: UpsertIntegrationInput,
): IntegrationAdapter {
  const existing = IntegrationRepository.findById(id);
  if (!existing) throw new Error("适配器不存在");
  const stored = IntegrationRepository.getStoredConfig(id);
  const adapter = baseAdapter(id, input);
  adapter.status = existing.status;
  adapter.lastSync = existing.lastSync;
  adapter.eventsToday = existing.eventsToday;
  IntegrationRepository.upsert(adapter, buildStoredConfig(input, stored?.secrets));
  return IntegrationRepository.findById(id)!;
}

export function deleteIntegration(id: string): boolean {
  return IntegrationRepository.delete(id);
}
