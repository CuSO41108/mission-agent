// Todo Repository · 待办 CRUD（支持父子嵌套）

import { getDb } from "../db/client";
import type { Todo, Assignee, AgentTaskType, ArtifactFormat } from "../../renderer/types";
import { toBool, toNumberOrNull, type DbRow } from "./base";

export function mapTodo(row: DbRow): Todo {
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    title: String(row.title),
    done: toBool(row.done),
    dueDate: toNumberOrNull(row.due_date),
    assignee: String(row.assignee ?? "human") as Assignee,
    subtasks: [], // 由 Service 层组装父子关系
    source: row.source ? String(row.source) : undefined,
    agentTaskType: String(row.agent_task_type ?? "analysis") as AgentTaskType,
    artifactFormat: String(row.artifact_format ?? "markdown") as ArtifactFormat,
    workflowId: row.workflow_id ? String(row.workflow_id) : null,
  };
}

/**
 * 带 parentId 的 Todo（仅 Service 层内部使用）
 * 用于组装父子嵌套结构
 */
export interface TodoWithParent extends Todo {
  parentId: string | null;
}

function mapTodoWithParent(row: DbRow): TodoWithParent {
  return {
    ...mapTodo(row),
    parentId: row.parent_id ? String(row.parent_id) : null,
  };
}

export const TodoRepository = {
  findById(id: string): TodoWithParent | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM todos WHERE id = ?;").get(id) as DbRow | undefined;
    return row ? mapTodoWithParent(row) : null;
  },

  listByFolder(folderId: string): Todo[] {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM todos WHERE folder_id = ? ORDER BY sort_order, created_at;")
      .all(folderId) as DbRow[];
    return rows.map(mapTodo);
  },

  /**
   * 返回带 parent_id 的 todo 列表（Service 层组装父子树用）
   */
  listByFolderWithParent(folderId: string): TodoWithParent[] {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM todos WHERE folder_id = ? ORDER BY sort_order, created_at;")
      .all(folderId) as DbRow[];
    return rows.map(mapTodoWithParent);
  },

  insert(todo: Todo, parentId: string | null = null): void {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO todos
        (id, folder_id, parent_id, title, done, due_date, assignee, source,
         agent_task_type, artifact_format, workflow_id, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      todo.id,
      todo.folderId,
      parentId,
      todo.title,
      todo.done ? 1 : 0,
      todo.dueDate,
      todo.assignee,
      todo.source ?? null,
      todo.agentTaskType ?? "analysis",
      todo.artifactFormat ?? "markdown",
      todo.workflowId ?? null,
      0,
      Date.now(),
    );
  },

  toggleDone(folderId: string, id: string, done: boolean): boolean {
    const db = getDb();
    const result = db
      .prepare("UPDATE todos SET done = ? WHERE id = ? AND folder_id = ?;")
      .run(done ? 1 : 0, id, folderId);
    return Number(result.changes) === 1;
  },

  delete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM todos WHERE id = ?;").run(id);
  },
};
