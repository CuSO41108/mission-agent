// Integration Repository · 接口适配器 CRUD

import { getDb } from "../db/client";
import type {
  IntegrationAdapter,
  IntegrationAuthType,
  IntegrationSecretKey,
  IntegrationStatus,
  IntegrationType,
} from "../../renderer/types";
import { toNumberOrNull, type DbRow } from "./base";

const SECRET_KEYS: IntegrationSecretKey[] = [
  "apiKey",
  "clientId",
  "clientSecret",
  "username",
  "password",
  "token",
  "webhookUrl",
];

export interface StoredIntegrationConfig {
  provider: string;
  account: string;
  endpoint: string;
  imapHost: string;
  imapPort: number | null;
  smtpHost: string;
  smtpPort: number | null;
  webhookUrl: string;
  authType: IntegrationAuthType;
  mode: IntegrationAdapter["config"]["mode"];
  targets: IntegrationAdapter["config"]["targets"];
  secretConfigured: Record<IntegrationSecretKey, boolean>;
  /** 仅用于从旧版本迁移；新写入绝不能包含此字段。 */
  secrets?: Partial<Record<IntegrationSecretKey, string>>;
}

const EMPTY_STORED_CONFIG: StoredIntegrationConfig = {
  provider: "",
  account: "",
  endpoint: "",
  imapHost: "",
  imapPort: null,
  smtpHost: "",
  smtpPort: null,
  webhookUrl: "",
  authType: "none",
  mode: "legacy",
  targets: [],
  secretConfigured: Object.fromEntries(SECRET_KEYS.map((key) => [key, false])) as Record<IntegrationSecretKey, boolean>,
};

function parseStoredConfig(value: unknown): StoredIntegrationConfig {
  if (!value) return { ...EMPTY_STORED_CONFIG, targets: [], secretConfigured: { ...EMPTY_STORED_CONFIG.secretConfigured } };
  try {
    const parsed = JSON.parse(String(value)) as Partial<StoredIntegrationConfig>;
    return {
      ...EMPTY_STORED_CONFIG,
      ...parsed,
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
      secretConfigured: {
        ...EMPTY_STORED_CONFIG.secretConfigured,
        ...parsed.secretConfigured,
        ...Object.fromEntries(SECRET_KEYS.map((key) => [key, Boolean(parsed.secrets?.[key]) || Boolean(parsed.secretConfigured?.[key])])),
      },
      secrets: parsed.secrets,
    };
  } catch {
    return { ...EMPTY_STORED_CONFIG, targets: [], secretConfigured: { ...EMPTY_STORED_CONFIG.secretConfigured } };
  }
}

export function mapIntegration(row: DbRow): IntegrationAdapter {
  const config = parseStoredConfig(row.config);
  return {
    id: String(row.id),
    type: String(row.type) as IntegrationType,
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    status: String(row.status ?? "disconnected") as IntegrationStatus,
    lastSync: toNumberOrNull(row.last_sync),
    eventsToday: Number(row.events_today ?? 0),
    config: {
      provider: config.provider,
      account: config.account,
      endpoint: config.endpoint,
      imapHost: config.imapHost,
      imapPort: config.imapPort,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      webhookUrl: config.webhookUrl,
      authType: config.authType,
      mode: config.mode,
      targets: config.targets,
      secretConfigured: { ...config.secretConfigured },
    },
  };
}

export const IntegrationRepository = {
  list(): IntegrationAdapter[] {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM integrations ORDER BY name;").all() as DbRow[];
    return rows.map(mapIntegration);
  },

  findById(id: string): IntegrationAdapter | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM integrations WHERE id = ?;").get(id) as DbRow | undefined;
    return row ? mapIntegration(row) : null;
  },

  getStoredConfig(id: string): StoredIntegrationConfig | null {
    const db = getDb();
    const row = db.prepare("SELECT config FROM integrations WHERE id = ?;").get(id) as
      | { config: unknown }
      | undefined;
    return row ? parseStoredConfig(row.config) : null;
  },

  listStored(): Array<{ adapter: IntegrationAdapter; config: StoredIntegrationConfig }> {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM integrations ORDER BY name;").all() as DbRow[];
    return rows.map((row) => ({ adapter: mapIntegration(row), config: parseStoredConfig(row.config) }));
  },

  upsert(integration: IntegrationAdapter, config: StoredIntegrationConfig): void {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO integrations
        (id, type, name, description, status, last_sync, events_today, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      integration.id,
      integration.type,
      integration.name,
      integration.description,
      integration.status,
      integration.lastSync,
      integration.eventsToday,
      JSON.stringify(config),
    );
  },

  updateStatus(id: string, status: IntegrationStatus): void {
    const db = getDb();
    db.prepare("UPDATE integrations SET status = ? WHERE id = ?;").run(status, id);
  },

  recordSuccessfulEvent(id: string, timestamp = Date.now()): void {
    const db = getDb();
    db.prepare(
      "UPDATE integrations SET status = 'connected', last_sync = ?, events_today = events_today + 1 WHERE id = ?;",
    ).run(timestamp, id);
  },

  delete(id: string): boolean {
    const db = getDb();
    const result = db.prepare("DELETE FROM integrations WHERE id = ?;").run(id);
    return Number(result.changes) === 1;
  },
};
