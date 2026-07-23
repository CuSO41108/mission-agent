// 种子数据 · 从 src/renderer/data/mock.ts 抽取
// 仅在首次启动（数据库文件不存在）时执行
// 之后每次启动只 migrate，不会重复 seed，保证用户数据不被覆盖

import { getDb } from "./client";
import { mockFolders } from "../../renderer/data/mock";
import type { TaskFolder } from "../../renderer/types";

/**
 * 执行种子数据写入
 * 调用前需确保 migrate 已完成（表已建好）
 * 幂等性：所有 INSERT 用 INSERT OR IGNORE，避免重复 id 报错
 */
export function seedDatabase(): void {
  const db = getDb();

  // 开启事务，seed 全部成功或全部回滚
  db.exec("BEGIN;");
  try {
    for (const folder of mockFolders) {
      insertFolder(folder);
      for (const todo of folder.todos) {
        insertTodo(todo, folder.id, null);
        // 展开嵌套 subtasks（parent_id 指向父 todo）
        for (const sub of todo.subtasks) {
          insertTodo(sub, folder.id, todo.id);
        }
      }
      for (const material of folder.materials) {
        insertMaterial(material);
      }
      for (const entry of folder.timeline) {
        insertTimeline(entry);
      }
      insertAgentConfig(folder.id, folder.agentConfig);
    }

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw new Error(
      `[db] seedDatabase 失败：${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function insertFolder(folder: TaskFolder): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO folders
      (id, name, category, priority, status, deadline, progress, cover_color, source_integration, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    folder.id,
    folder.name,
    folder.category,
    folder.priority,
    folder.status,
    folder.deadline,
    folder.progress,
    folder.coverColor,
    folder.sourceIntegration ?? null,
    folder.createdAt,
    folder.createdAt, // updated_at 初始等于 created_at
  );
}

function insertTodo(
  todo: TaskFolder["todos"][number],
  folderId: string,
  parentId: string | null,
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO todos
      (id, folder_id, parent_id, title, done, due_date, assignee, source,
       agent_task_type, artifact_format, workflow_id, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    todo.id,
    folderId,
    parentId,
    todo.title,
    todo.done ? 1 : 0,
    todo.dueDate,
    todo.assignee,
    todo.source ?? null,
    todo.agentTaskType ?? "analysis",
    todo.artifactFormat ?? "markdown",
    todo.workflowId ?? null,
    0, // sort_order 暂未在 mock 中建模
    Date.now(),
  );
}

function insertMaterial(material: TaskFolder["materials"][number]): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO materials
      (id, folder_id, type, name, content, storage_mode, original_path, archived_path, source_integration, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    material.id,
    material.folderId,
    material.type,
    material.name,
    material.content,
    "ref", // 默认引用模式
    null,
    null,
    material.sourceIntegration ?? null,
    material.addedAt,
  );
}

function insertTimeline(entry: TaskFolder["timeline"][number]): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO timeline
      (id, folder_id, actor, action, meta, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.folderId,
    entry.actor,
    entry.action,
    entry.meta ? JSON.stringify(entry.meta) : null,
    entry.timestamp,
  );
}

function insertAgentConfig(
  folderId: string,
  config: TaskFolder["agentConfig"],
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO agent_configs
      (folder_id, enabled, strategy, permissions, workflow_id, last_action)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    folderId,
    config.enabled ? 1 : 0,
    config.strategy,
    JSON.stringify(config.permissions),
    config.workflowId ?? null,
    config.lastAction,
  );
}
