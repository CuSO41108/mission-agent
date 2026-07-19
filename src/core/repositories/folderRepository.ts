// Folder Repository · 任务舱 CRUD
// 零 electron 依赖，返回类型复用 renderer/types

import { getDb } from "../db/client";
import type { TaskFolder, Priority, FolderStatus } from "../../renderer/types";
import { toNumberOrNull, type DbRow } from "./base";

/**
 * 将 DB 行映射为 TaskFolder 业务对象（不含关联的 todos/materials/timeline）
 * 关联数据通过各自的 Repository 查询，组装在 Service 层完成
 */
export function mapFolder(row: DbRow): TaskFolder {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category ?? ""),
    priority: String(row.priority) as Priority,
    status: String(row.status) as FolderStatus,
    deadline: toNumberOrNull(row.deadline),
    progress: Number(row.progress ?? 0),
    coverColor: String(row.cover_color ?? ""),
    sourceIntegration: row.source_integration ? String(row.source_integration) : undefined,
    createdAt: Number(row.created_at),
    todos: [],
    materials: [],
    agentConfig: {
      enabled: false,
      strategy: "follow_up",
      permissions: { read: true, write: false, notify: false, create_subtask: false },
      lastAction: null,
    },
    timeline: [],
  };
}

export const FolderRepository = {
  list(): TaskFolder[] {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM folders ORDER BY created_at DESC;").all() as DbRow[];
    return rows.map(mapFolder);
  },

  findById(id: string): TaskFolder | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM folders WHERE id = ?;").get(id) as DbRow | undefined;
    return row ? mapFolder(row) : null;
  },

  insert(folder: TaskFolder): void {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO folders
        (id, name, category, priority, status, deadline, progress, cover_color, source_integration, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
      Date.now(),
    );
  },

  updateProgress(id: string, progress: number): void {
    const db = getDb();
    db.prepare("UPDATE folders SET progress = ?, updated_at = ? WHERE id = ?;").run(
      progress,
      Date.now(),
      id,
    );
  },

  updateStatus(id: string, status: FolderStatus): void {
    const db = getDb();
    db.prepare("UPDATE folders SET status = ?, updated_at = ? WHERE id = ?;").run(
      status,
      Date.now(),
      id,
    );
  },

  delete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM folders WHERE id = ?;").run(id);
  },
};
