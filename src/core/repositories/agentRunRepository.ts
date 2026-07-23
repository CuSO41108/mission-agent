import { getDb } from "../db/client";
import type {
  AgentRunRecord,
  AgentRunStatus,
  EnqueueAgentRunInput,
} from "../agent/runTypes";
import { toNumberOrNull, type DbRow } from "./base";

type AgentRunRow = DbRow & {
  id: string;
  folder_id: string;
  todo_id: string | null;
  source: AgentRunRecord["source"];
  status: AgentRunStatus;
  lock_key: string;
  queued_at: number;
  started_at: number | null;
  finished_at: number | null;
  summary: string | null;
  error: string | null;
  error_code: string | null;
  model: string | null;
  retry_of_run_id: string | null;
};

export function mapAgentRun(row: AgentRunRow): AgentRunRecord {
  return {
    id: row.id,
    folderId: row.folder_id,
    todoId: row.todo_id,
    source: row.source,
    status: row.status,
    lockKey: row.lock_key,
    queuedAt: Number(row.queued_at),
    startedAt: toNumberOrNull(row.started_at),
    finishedAt: toNumberOrNull(row.finished_at),
    summary: row.summary,
    error: row.error,
    errorCode: row.error_code,
    model: row.model,
    retryOfRunId: row.retry_of_run_id,
  };
}

function activeRunForTarget(folderId: string, todoId: string | null): AgentRunRecord | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM agent_runs
    WHERE folder_id = ?
      AND ((todo_id IS NULL AND ? IS NULL) OR todo_id = ?)
      AND status IN ('queued', 'running')
    ORDER BY queued_at ASC
    LIMIT 1
  `).get(folderId, todoId, todoId) as AgentRunRow | undefined;
  return row ? mapAgentRun(row) : null;
}

export const AgentRunRepository = {
  enqueue(input: EnqueueAgentRunInput): { run: AgentRunRecord; created: boolean } {
    const todoId = input.todoId ?? null;
    const existing = activeRunForTarget(input.folderId, todoId);
    if (existing) return { run: existing, created: false };

    const now = Date.now();
    const run: AgentRunRecord = {
      id: `ar-${now}-${Math.random().toString(36).slice(2, 8)}`,
      folderId: input.folderId,
      todoId,
      source: input.source,
      status: "queued",
      lockKey: input.lockKey ?? `folder:${input.folderId}`,
      queuedAt: now,
      startedAt: null,
      finishedAt: null,
      summary: null,
      error: null,
      errorCode: null,
      model: input.model ?? null,
      retryOfRunId: input.retryOfRunId ?? null,
    };
    const db = getDb();
    db.prepare(`
      INSERT INTO agent_runs (
        id, folder_id, todo_id, source, status, lock_key, queued_at,
        started_at, finished_at, summary, error, error_code, model, retry_of_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id, run.folderId, run.todoId, run.source, run.status, run.lockKey,
      run.queuedAt, null, null, null, null, null, run.model, run.retryOfRunId,
    );
    return { run, created: true };
  },

  listActive(): AgentRunRecord[] {
    const db = getDb();
    return (db.prepare(`
      SELECT * FROM agent_runs
      WHERE status IN ('queued', 'running')
      ORDER BY queued_at ASC
    `).all() as AgentRunRow[]).map(mapAgentRun);
  },

  listRecent(limit = 50): AgentRunRecord[] {
    const db = getDb();
    return (db.prepare("SELECT * FROM agent_runs ORDER BY queued_at DESC LIMIT ?").all(limit) as AgentRunRow[]).map(mapAgentRun);
  },

  listRecentByFolder(folderId: string, limit = 20): AgentRunRecord[] {
    const db = getDb();
    return (db.prepare(`
      SELECT * FROM agent_runs
      WHERE folder_id = ?
      ORDER BY queued_at DESC
      LIMIT ?
    `).all(folderId, limit) as AgentRunRow[]).map(mapAgentRun);
  },

  getById(id: string): AgentRunRecord | null {
    const row = getDb().prepare("SELECT * FROM agent_runs WHERE id = ?;").get(id) as AgentRunRow | undefined;
    return row ? mapAgentRun(row) : null;
  },

  /**
   * 原子地取得指定 Run 的资源租约。租约过期后可由下一次调度回收，
   * 不依赖内存 Mutex，因此同一任务舱不会被手动执行与心跳同时处理。
   */
  claim(id: string, leaseMs = 15 * 60_000): AgentRunRecord | null {
    const db = getDb();
    const now = Date.now();
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare("DELETE FROM agent_resource_locks WHERE expires_at <= ?;").run(now);
      const row = db.prepare("SELECT * FROM agent_runs WHERE id = ? AND status = 'queued';").get(id) as AgentRunRow | undefined;
      if (!row) {
        db.exec("COMMIT;");
        return null;
      }
      const run = mapAgentRun(row);
      const lock = db.prepare(`
        INSERT INTO agent_resource_locks (lock_key, run_id, expires_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(lock_key) DO UPDATE SET
          run_id = excluded.run_id,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
        WHERE agent_resource_locks.expires_at <= ?
      `).run(run.lockKey, run.id, now + leaseMs, now, now);
      if (Number(lock.changes) !== 1) {
        db.exec("COMMIT;");
        return null;
      }
      db.prepare("UPDATE agent_runs SET status = 'running', started_at = ? WHERE id = ?;").run(now, run.id);
      db.exec("COMMIT;");
      return { ...run, status: "running", startedAt: now };
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  },

  /** 按 FIFO 扫描队列，跳过资源冲突项并原子认领第一个可运行的 Run。 */
  claimNext(leaseMs = 24 * 60 * 60_000): AgentRunRecord | null {
    const db = getDb();
    const now = Date.now();
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare("DELETE FROM agent_resource_locks WHERE expires_at <= ?;").run(now);
      const rows = db.prepare(`
        SELECT * FROM agent_runs
        WHERE status = 'queued'
        ORDER BY queued_at ASC, id ASC
      `).all() as AgentRunRow[];
      for (const row of rows) {
        const run = mapAgentRun(row);
        const lock = db.prepare(`
          INSERT INTO agent_resource_locks (lock_key, run_id, expires_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(lock_key) DO NOTHING
        `).run(run.lockKey, run.id, now + leaseMs, now);
        if (Number(lock.changes) !== 1) continue;
        const changed = db.prepare(`
          UPDATE agent_runs SET status = 'running', started_at = ?
          WHERE id = ? AND status = 'queued'
        `).run(now, run.id);
        if (Number(changed.changes) === 1) {
          db.exec("COMMIT;");
          return { ...run, status: "running", startedAt: now };
        }
        db.prepare("DELETE FROM agent_resource_locks WHERE run_id = ?;").run(run.id);
      }
      db.exec("COMMIT;");
      return null;
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  },

  finish(
    id: string,
    status: Extract<AgentRunStatus, "succeeded" | "failed" | "cancelled">,
    result: Pick<AgentRunRecord, "summary" | "error" | "errorCode">,
  ): void {
    const db = getDb();
    db.exec("BEGIN;");
    try {
      db.prepare(`
        UPDATE agent_runs
        SET status = ?, finished_at = ?, summary = ?, error = ?, error_code = ?
        WHERE id = ? AND status = 'running'
      `).run(status, Date.now(), result.summary, result.error, result.errorCode, id);
      db.prepare("DELETE FROM agent_resource_locks WHERE run_id = ?;").run(id);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  },

  cancelQueued(id: string, error: string, errorCode: string): boolean {
    const db = getDb();
    const result = db.prepare(`
      UPDATE agent_runs
      SET status = 'cancelled', finished_at = ?, error = ?, error_code = ?
      WHERE id = ? AND status = 'queued'
    `).run(Date.now(), error, errorCode, id);
    return Number(result.changes) === 1;
  },

  /** 应用非正常退出后不重放副作用；把遗留 running Run 标记为取消并释放锁。 */
  recoverInterruptedRuns(): number {
    const db = getDb();
    db.exec("BEGIN;");
    try {
      const result = db.prepare(`
        UPDATE agent_runs
        SET status = 'cancelled', finished_at = ?, error = '应用在运行完成前退出', error_code = 'APP_INTERRUPTED'
        WHERE status = 'running'
      `).run(Date.now());
      db.exec("DELETE FROM agent_resource_locks;");
      db.exec("COMMIT;");
      return Number(result.changes);
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  },
};
