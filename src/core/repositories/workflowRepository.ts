// Workflow Repository · 工作流规则 CRUD

import { getDb } from "../db/client";
import type { WorkflowRule } from "../../renderer/types";
import { toBool, toNumberOrNull, parseJson, type DbRow } from "./base";

export function mapWorkflow(row: DbRow): WorkflowRule {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    enabled: toBool(row.enabled),
    trigger: parseJson(row.trigger, { source: "", condition: "" }),
    conditions: parseJson(row.conditions, []),
    actions: parseJson(row.actions, []),
    runs: Number(row.runs ?? 0),
    lastRun: toNumberOrNull(row.last_run),
  };
}

export const WorkflowRepository = {
  list(): WorkflowRule[] {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM workflows ORDER BY name;").all() as DbRow[];
    return rows.map(mapWorkflow);
  },

  findById(id: string): WorkflowRule | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM workflows WHERE id = ?;").get(id) as DbRow | undefined;
    return row ? mapWorkflow(row) : null;
  },

  insert(workflow: WorkflowRule): void {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO workflows
        (id, name, enabled, trigger, conditions, actions, runs, last_run)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      workflow.id,
      workflow.name,
      workflow.enabled ? 1 : 0,
      JSON.stringify(workflow.trigger),
      JSON.stringify(workflow.conditions),
      JSON.stringify(workflow.actions),
      workflow.runs,
      workflow.lastRun,
    );
  },

  setEnabled(id: string, enabled: boolean): void {
    const db = getDb();
    db.prepare("UPDATE workflows SET enabled = ? WHERE id = ?;").run(enabled ? 1 : 0, id);
  },
};
