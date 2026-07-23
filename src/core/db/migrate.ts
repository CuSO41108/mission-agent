// 数据库迁移 · 幂等执行建表语句
// 机制：schema_version 表记录已应用的版本号
// 每次启动比对 SCHEMA_VERSION 常量，缺什么补什么

import { getDb } from "./client";
import { ALL_SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

/**
 * 执行数据库迁移
 * 幂等：所有建表语句都是 CREATE TABLE IF NOT EXISTS，可重复执行
 *
 * 迁移逻辑：
 * 1. 确保 schema_version 表存在（首次启动时连这张表都还没有）
 * 2. 读取当前已应用的版本号
 * 3. 若低于 SCHEMA_VERSION，执行 ALL_SCHEMA_SQL，更新版本号
 * 4. 若已等于 SCHEMA_VERSION，跳过
 *
 * 注意：本机制是"轻量级"，不做 ALTER TABLE 类的增量迁移
 * 后续若需要改字段，新增 SCHEMA_VERSION_N 常量并补 ALTER 语句即可
 */
export function migrateDatabase(): void {
  const db = getDb();

  // 第一步：确保 schema_version 表存在
  // 这条 SQL 自己也是 IF NOT EXISTS，可重复执行
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  // 读取当前版本号
  const row = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1;").get() as
    | { version: number }
    | undefined;

  const currentVersion = row?.version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) {
    // 已是最新版本，无需迁移
    return;
  }

  // 执行所有建表语句（事务包裹）
  db.exec("BEGIN;");
  try {
    for (const sql of ALL_SCHEMA_SQL) {
      // 每条 SQL 可能包含多个语句（CREATE TABLE + CREATE INDEX）
      // DatabaseSync.exec 支持多语句执行
      db.exec(sql);
    }

    if (currentVersion < 2) {
      db.exec(`
        DELETE FROM integrations
        WHERE id IN (
          'int-email', 'int-feishu', 'int-calendar', 'int-wechat',
          'int-slack', 'int-xhs', 'int-notion', 'int-telegram'
        );
      `);
    }

    if (currentVersion < 3) {
      const ensureColumn = (table: string, column: string, definition: string) => {
        const columns = db.prepare(`PRAGMA table_info(${table});`).all() as Array<{ name: string }>;
        if (!columns.some((item) => item.name === column)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
        }
      };
      ensureColumn("todos", "agent_task_type", "TEXT DEFAULT 'analysis'");
      ensureColumn("todos", "artifact_format", "TEXT DEFAULT 'markdown'");
      ensureColumn("todos", "workflow_id", "TEXT");
      ensureColumn("agent_configs", "workflow_id", "TEXT");
      ensureColumn("workflows", "layout", "TEXT");
      ensureColumn("workflows", "last_status", "TEXT");
      ensureColumn("workflows", "last_error", "TEXT");
      db.exec(`
        UPDATE todos SET agent_task_type = 'analysis' WHERE agent_task_type IS NULL;
        UPDATE todos SET artifact_format = 'markdown' WHERE artifact_format IS NULL;
        DELETE FROM workflows WHERE id IN ('wf-001', 'wf-002', 'wf-003', 'wf-004');
        UPDATE workflows SET runs = 0, last_run = NULL, last_status = NULL, last_error = NULL;
      `);
    }

    if (currentVersion < 4) {
      db.exec(`
        DELETE FROM timeline
        WHERE id IN (
          'tl-001', 'tl-002', 'tl-003', 'tl-004',
          'tl-101', 'tl-102', 'tl-103',
          'tl-201', 'tl-202',
          'tl-301', 'tl-302',
          'tl-401', 'tl-402',
          'tl-501', 'tl-502'
        );
        UPDATE agent_configs
        SET last_action = NULL
        WHERE folder_id IN ('f-001', 'f-002', 'f-003', 'f-004', 'f-005', 'f-006')
          AND NOT EXISTS (
            SELECT 1 FROM timeline
            WHERE timeline.folder_id = agent_configs.folder_id
              AND timeline.actor = 'agent'
          );
        UPDATE folders
        SET progress = CASE
          WHEN (SELECT COUNT(*) FROM todos WHERE todos.folder_id = folders.id) = 0 THEN 0
          ELSE CAST(ROUND(
            100.0 * (SELECT COUNT(*) FROM todos WHERE todos.folder_id = folders.id AND todos.done = 1)
            / (SELECT COUNT(*) FROM todos WHERE todos.folder_id = folders.id)
          ) AS INTEGER)
        END;
      `);
    }

    if (currentVersion < 5) {
      db.exec(`
        UPDATE todos
        SET done = 1
        WHERE done = 0
          AND folder_id IN (SELECT id FROM folders WHERE status = 'done');
        UPDATE folders
        SET progress = 100, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
        WHERE status = 'done';
      `);
    }

    // 记录版本号
    db.prepare(
      "INSERT INTO schema_version (version, applied_at) VALUES (?, ?);",
    ).run(SCHEMA_VERSION, Date.now());

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw new Error(
      `[db] migrateDatabase 失败：${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * 查询当前已应用的 schema 版本（调试用）
 */
export function getSchemaVersion(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1;")
    .get() as { version: number } | undefined;
  return row?.version ?? 0;
}
