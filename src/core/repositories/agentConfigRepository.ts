// AgentConfig Repository · Agent 配置 CRUD

import { getDb } from "../db/client";
import type { AgentConfig, AgentStrategy } from "../../renderer/types";
import { toBool, toNumberOrNull, parseJson, type DbRow } from "./base";

const DEFAULT_PERMISSIONS: AgentConfig["permissions"] = {
  read: true,
  write: false,
  notify: false,
  create_subtask: false,
};

export function mapAgentConfig(row: DbRow): AgentConfig {
  return {
    enabled: toBool(row.enabled),
    strategy: String(row.strategy ?? "follow_up") as AgentStrategy,
    permissions: parseJson(row.permissions, DEFAULT_PERMISSIONS),
    lastAction: toNumberOrNull(row.last_action),
  };
}

export const AgentConfigRepository = {
  findByFolder(folderId: string): AgentConfig | null {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM agent_configs WHERE folder_id = ?;")
      .get(folderId) as DbRow | undefined;
    return row ? mapAgentConfig(row) : null;
  },

  upsert(folderId: string, config: AgentConfig): void {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO agent_configs
        (folder_id, enabled, strategy, permissions, last_action)
       VALUES (?, ?, ?, ?, ?);`,
    ).run(
      folderId,
      config.enabled ? 1 : 0,
      config.strategy,
      JSON.stringify(config.permissions),
      config.lastAction,
    );
  },

  setEnabled(folderId: string, enabled: boolean): void {
    const db = getDb();
    db.prepare("UPDATE agent_configs SET enabled = ? WHERE folder_id = ?;").run(
      enabled ? 1 : 0,
      folderId,
    );
  },
};
