// Integration Repository · 接口适配器 CRUD

import { getDb } from "../db/client";
import type { IntegrationAdapter, IntegrationType, IntegrationStatus } from "../../renderer/types";
import { toNumberOrNull, type DbRow } from "./base";

export function mapIntegration(row: DbRow): IntegrationAdapter {
  return {
    id: String(row.id),
    type: String(row.type) as IntegrationType,
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    status: String(row.status ?? "disconnected") as IntegrationStatus,
    lastSync: toNumberOrNull(row.last_sync),
    eventsToday: Number(row.events_today ?? 0),
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

  insert(integration: IntegrationAdapter): void {
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
      null,
    );
  },

  updateStatus(id: string, status: IntegrationStatus): void {
    const db = getDb();
    db.prepare("UPDATE integrations SET status = ? WHERE id = ?;").run(status, id);
  },
};
