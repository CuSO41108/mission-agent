// Workflow Repository · 工作流规则 CRUD

import { getDb } from "../db/client";
import type {
  WorkflowCheckpoint,
  WorkflowDataEnvelope,
  WorkflowGraph,
  WorkflowRule,
  WorkflowRun,
  WorkflowStepRun,
  WorkflowStepStatus,
  WorkflowTrigger,
} from "../../renderer/types";
import { toBool, toNumberOrNull, parseJson, type DbRow } from "./base";
import { graphFromLegacy } from "../workflow/graph";

export function mapWorkflow(row: DbRow): WorkflowRule {
  const trigger = parseJson<WorkflowTrigger>(row.trigger, { type: "manual", label: "手动执行" });
  const safeTrigger: WorkflowTrigger = "type" in trigger
    ? trigger
    : { type: "manual", label: "手动执行" };
  const base: Omit<WorkflowRule, "graph"> = {
    id: String(row.id),
    name: String(row.name ?? ""),
    enabled: toBool(row.enabled),
    trigger: safeTrigger,
    conditions: parseJson(row.conditions, []),
    actions: parseJson(row.actions, []),
    layout: parseJson(row.layout, []),
    version: Number(row.version ?? 1),
    runs: Number(row.runs ?? 0),
    lastRun: toNumberOrNull(row.last_run),
    lastStatus: row.last_status === "success" || row.last_status === "failed"
      ? row.last_status
      : null,
    lastError: row.last_error ? String(row.last_error) : null,
  };
  const storedGraph = parseJson<WorkflowGraph | null>(row.graph, null);
  return {
    ...base,
    graph: storedGraph?.schemaVersion === 1 && Array.isArray(storedGraph.nodes)
      ? storedGraph
      : graphFromLegacy(base),
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
      `INSERT INTO workflows
        (id, name, enabled, trigger, conditions, actions, layout, graph, version, runs, last_run, last_status, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         enabled = excluded.enabled,
         trigger = excluded.trigger,
         conditions = excluded.conditions,
         actions = excluded.actions,
         layout = excluded.layout,
         graph = excluded.graph,
         version = excluded.version,
         runs = excluded.runs,
         last_run = excluded.last_run,
         last_status = excluded.last_status,
         last_error = excluded.last_error;`,
    ).run(
      workflow.id,
      workflow.name,
      workflow.enabled ? 1 : 0,
      JSON.stringify(workflow.trigger),
      JSON.stringify(workflow.conditions),
      JSON.stringify(workflow.actions),
      JSON.stringify(workflow.layout),
      JSON.stringify(workflow.graph),
      workflow.version,
      workflow.runs,
      workflow.lastRun,
      workflow.lastStatus,
      workflow.lastError,
    );
    db.prepare(
      `INSERT OR IGNORE INTO workflow_versions (id, workflow_id, version, graph, created_at)
       VALUES (?, ?, ?, ?, ?);`,
    ).run(
      `wfv-${workflow.id}-${workflow.version}`,
      workflow.id,
      workflow.version,
      JSON.stringify(workflow.graph),
      Date.now(),
    );
  },

  ensureGraphSnapshot(id: string, graph: WorkflowGraph, version: number): void {
    const db = getDb();
    db.prepare("UPDATE workflows SET graph = ?, version = ? WHERE id = ?;").run(JSON.stringify(graph), version, id);
    db.prepare(
      `INSERT OR IGNORE INTO workflow_versions (id, workflow_id, version, graph, created_at)
       VALUES (?, ?, ?, ?, ?);`,
    ).run(`wfv-${id}-${version}`, id, version, JSON.stringify(graph), Date.now());
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

  updateLastResult(id: string, status: "success" | "failed", error: string | null): void {
    getDb().prepare(
      "UPDATE workflows SET last_run = ?, last_status = ?, last_error = ? WHERE id = ?;",
    ).run(Date.now(), status, error, id);
  },
};

export const WorkflowRunRepository = {
  insert(run: WorkflowRun): void {
    const db = getDb();
    db.prepare(
      `INSERT INTO workflow_runs
        (id, workflow_id, status, trigger_type, folder_id, message, started_at, finished_at, plan_version, resumed_from_run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      run.id,
      run.workflowId,
      run.status,
      run.triggerType,
      run.folderId,
      run.message,
      run.startedAt,
      run.finishedAt,
      run.planVersion ?? 1,
      run.resumedFromRunId ?? null,
    );
  },

  update(run: WorkflowRun): void {
    getDb().prepare(
      `UPDATE workflow_runs
       SET status = ?, message = ?, finished_at = ?, plan_version = ?, resumed_from_run_id = ?
       WHERE id = ?;`,
    ).run(run.status, run.message, run.finishedAt, run.planVersion ?? 1, run.resumedFromRunId ?? null, run.id);
  },

  findById(id: string): WorkflowRun | null {
    const row = getDb().prepare("SELECT * FROM workflow_runs WHERE id = ?;").get(id) as DbRow | undefined;
    return row ? mapRun(row) : null;
  },

  listByWorkflow(workflowId: string, limit = 20): WorkflowRun[] {
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?;`,
    ).all(workflowId, limit) as DbRow[];
    return rows.map(mapRun);
  },
};

function mapRun(row: DbRow): WorkflowRun {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    status: String(row.status) as WorkflowRun["status"],
    triggerType: String(row.trigger_type) as WorkflowRun["triggerType"],
    folderId: row.folder_id ? String(row.folder_id) : null,
    message: String(row.message ?? ""),
    startedAt: Number(row.started_at),
    finishedAt: Number(row.finished_at),
    planVersion: Number(row.plan_version ?? 1),
    resumedFromRunId: row.resumed_from_run_id ? String(row.resumed_from_run_id) : null,
  };
}

function mapStep(row: DbRow): WorkflowStepRun {
  return {
    runId: String(row.run_id),
    stepId: String(row.step_id),
    status: String(row.status) as WorkflowStepStatus,
    idempotencyKey: String(row.idempotency_key),
    inputHash: row.input_hash ? String(row.input_hash) : null,
    output: parseJson<WorkflowDataEnvelope | null>(row.output_json, null),
    outputRef: row.output_ref ? String(row.output_ref) : null,
    error: row.error ? String(row.error) : null,
    attempts: Number(row.attempts ?? 0),
    startedAt: toNumberOrNull(row.started_at),
    finishedAt: toNumberOrNull(row.finished_at),
  };
}

export const WorkflowStepRunRepository = {
  initialize(runId: string, stepIds: string[]): void {
    const statement = getDb().prepare(
      `INSERT OR IGNORE INTO workflow_step_runs
       (run_id, step_id, status, idempotency_key, attempts)
       VALUES (?, ?, 'pending', ?, 0);`,
    );
    for (const stepId of stepIds) statement.run(runId, stepId, `${runId}:${stepId}`);
  },

  list(runId: string): WorkflowStepRun[] {
    return (getDb().prepare("SELECT * FROM workflow_step_runs WHERE run_id = ? ORDER BY rowid;").all(runId) as DbRow[]).map(mapStep);
  },

  find(runId: string, stepId: string): WorkflowStepRun | null {
    const row = getDb().prepare("SELECT * FROM workflow_step_runs WHERE run_id = ? AND step_id = ?;").get(runId, stepId) as DbRow | undefined;
    return row ? mapStep(row) : null;
  },

  markRunning(runId: string, stepId: string, inputHash: string): void {
    getDb().prepare(
      `UPDATE workflow_step_runs
       SET status = 'running', input_hash = ?, error = NULL, attempts = attempts + 1,
           started_at = COALESCE(started_at, ?), finished_at = NULL
       WHERE run_id = ? AND step_id = ?;`,
    ).run(inputHash, Date.now(), runId, stepId);
  },

  markSucceeded(runId: string, stepId: string, output: WorkflowDataEnvelope, outputRef: string | null = null): void {
    getDb().prepare(
      `UPDATE workflow_step_runs
       SET status = 'succeeded', output_json = ?, output_ref = ?, error = NULL, finished_at = ?
       WHERE run_id = ? AND step_id = ?;`,
    ).run(JSON.stringify(output), outputRef, Date.now(), runId, stepId);
  },

  markFailed(runId: string, stepId: string, error: string, needsReview = false): void {
    getDb().prepare(
      `UPDATE workflow_step_runs SET status = ?, error = ?, finished_at = ? WHERE run_id = ? AND step_id = ?;`,
    ).run(needsReview ? "needs_review" : "failed", error, Date.now(), runId, stepId);
  },
};

function mapCheckpoint(row: DbRow): WorkflowCheckpoint {
  return {
    runId: String(row.run_id),
    workflowId: String(row.workflow_id),
    planVersion: Number(row.plan_version),
    event: parseJson(row.event_json, {}),
    context: parseJson<WorkflowDataEnvelope>(row.context_json, { version: 1, data: null }),
    nextStepId: row.next_step_id ? String(row.next_step_id) : null,
    status: String(row.status) as WorkflowCheckpoint["status"],
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
    leaseExpiresAt: toNumberOrNull(row.lease_expires_at),
    updatedAt: Number(row.updated_at),
  };
}

export const WorkflowCheckpointRepository = {
  create(checkpoint: WorkflowCheckpoint): void {
    getDb().prepare(
      `INSERT INTO workflow_checkpoints
       (run_id, workflow_id, plan_version, event_json, context_json, next_step_id, status, lease_owner, lease_expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      checkpoint.runId,
      checkpoint.workflowId,
      checkpoint.planVersion,
      JSON.stringify(checkpoint.event),
      JSON.stringify(checkpoint.context),
      checkpoint.nextStepId,
      checkpoint.status,
      checkpoint.leaseOwner,
      checkpoint.leaseExpiresAt,
      checkpoint.updatedAt,
    );
  },

  find(runId: string): WorkflowCheckpoint | null {
    const row = getDb().prepare("SELECT * FROM workflow_checkpoints WHERE run_id = ?;").get(runId) as DbRow | undefined;
    return row ? mapCheckpoint(row) : null;
  },

  saveBoundary(runId: string, context: WorkflowDataEnvelope, nextStepId: string | null, status: WorkflowCheckpoint["status"]): void {
    getDb().prepare(
      `UPDATE workflow_checkpoints
       SET context_json = ?, next_step_id = ?, status = ?, updated_at = ?
       WHERE run_id = ?;`,
    ).run(JSON.stringify(context), nextStepId, status, Date.now(), runId);
  },

  tryAcquireLease(runId: string, owner: string, ttlMs: number, now = Date.now()): boolean {
    const result = getDb().prepare(
      `UPDATE workflow_checkpoints
       SET lease_owner = ?, lease_expires_at = ?, updated_at = ?
       WHERE run_id = ?
         AND (lease_owner IS NULL OR lease_owner = ? OR lease_expires_at IS NULL OR lease_expires_at < ?);`,
    ).run(owner, now + ttlMs, now, runId, owner, now);
    return Number(result.changes) === 1;
  },

  releaseLease(runId: string, owner: string): void {
    getDb().prepare(
      `UPDATE workflow_checkpoints SET lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
       WHERE run_id = ? AND lease_owner = ?;`,
    ).run(Date.now(), runId, owner);
  },
};

export const WorkflowVersionRepository = {
  findGraph(workflowId: string, version: number): WorkflowGraph | null {
    const row = getDb().prepare(
      "SELECT graph FROM workflow_versions WHERE workflow_id = ? AND version = ?;",
    ).get(workflowId, version) as DbRow | undefined;
    return row ? parseJson<WorkflowGraph | null>(row.graph, null) : null;
  },
};
