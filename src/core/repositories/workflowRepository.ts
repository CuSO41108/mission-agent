// Workflow Repository · 工作流规则 CRUD

import { getDb } from "../db/client";
import type { WorkflowRule, WorkflowRun, WorkflowTrigger } from "../../renderer/types";
import { toBool, toNumberOrNull, parseJson, type DbRow } from "./base";

export function mapWorkflow(row: DbRow): WorkflowRule {
  const trigger = parseJson<WorkflowTrigger>(row.trigger, { type: "manual", label: "手动执行" });
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    enabled: toBool(row.enabled),
    trigger: "type" in trigger ? trigger : { type: "manual", label: "手动执行" },
    conditions: parseJson(row.conditions, []),
    actions: parseJson(row.actions, []),
    layout: parseJson(row.layout, []),
    runs: Number(row.runs ?? 0),
    lastRun: toNumberOrNull(row.last_run),
    lastStatus: row.last_status === "success" || row.last_status === "failed"
      ? row.last_status
      : null,
    lastError: row.last_error ? String(row.last_error) : null,
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
        (id, name, enabled, trigger, conditions, actions, layout, runs, last_run, last_status, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      workflow.id,
      workflow.name,
      workflow.enabled ? 1 : 0,
      JSON.stringify(workflow.trigger),
      JSON.stringify(workflow.conditions),
      JSON.stringify(workflow.actions),
      JSON.stringify(workflow.layout),
      workflow.runs,
      workflow.lastRun,
      workflow.lastStatus,
      workflow.lastError,
    );
  },

  setEnabled(id: string, enabled: boolean): void {
    const db = getDb();
    db.prepare("UPDATE workflows SET enabled = ? WHERE id = ?;").run(enabled ? 1 : 0, id);
  },

  delete(id: string): boolean {
    const db = getDb();
    const result = db.prepare("DELETE FROM workflows WHERE id = ?;").run(id);
    return Number(result.changes) === 1;
  },

  recordResult(id: string, status: "success" | "failed", error: string | null): void {
    const db = getDb();
    db.prepare(
      `UPDATE workflows
       SET runs = runs + 1, last_run = ?, last_status = ?, last_error = ?
       WHERE id = ?;`,
    ).run(Date.now(), status, error, id);
  },
};

export const WorkflowRunRepository = {
  insert(run: WorkflowRun): void {
    const db = getDb();
    db.prepare(
      `INSERT INTO workflow_runs
        (id, workflow_id, status, trigger_type, folder_id, message, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      run.id,
      run.workflowId,
      run.status,
      run.triggerType,
      run.folderId,
      run.message,
      run.startedAt,
      run.finishedAt,
    );
  },

  listByWorkflow(workflowId: string, limit = 20): WorkflowRun[] {
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?;`,
    ).all(workflowId, limit) as DbRow[];
    return rows.map((row) => ({
      id: String(row.id),
      workflowId: String(row.workflow_id),
      status: String(row.status) as WorkflowRun["status"],
      triggerType: String(row.trigger_type) as WorkflowRun["triggerType"],
      folderId: row.folder_id ? String(row.folder_id) : null,
      message: String(row.message ?? ""),
      startedAt: Number(row.started_at),
      finishedAt: Number(row.finished_at),
    }));
  },
};
