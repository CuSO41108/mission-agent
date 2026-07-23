// Folder Service · 业务编排层
// 职责：把 FolderRepository / TodoRepository / MaterialRepository / TimelineRepository / AgentConfigRepository
// 查出来的扁平数据，组装成 TaskFolder 嵌套结构（todos 带子任务）
//
// 这一层是"业务大脑"——Repository 只管单表 CRUD，Service 管跨表组装
// 零 electron 依赖，未来 Web 版可复用

import type { TaskFolder, Todo } from "../../renderer/types";
import { FolderRepository } from "../repositories/folderRepository";
import { TodoRepository, type TodoWithParent } from "../repositories/todoRepository";
import { MaterialRepository } from "../repositories/materialRepository";
import { TimelineRepository } from "../repositories/timelineRepository";
import { AgentConfigRepository } from "../repositories/agentConfigRepository";

/**
 * 把扁平的 todo 列表（带 parentId）组装成父子嵌套结构
 * 顶层 todo（parentId === null）的 subtasks 填充其子节点
 */
function buildTodoTree(allTodos: TodoWithParent[]): Todo[] {
  const children = new Map<string | null, TodoWithParent[]>();
  for (const todo of allTodos) {
    const group = children.get(todo.parentId) ?? [];
    group.push(todo);
    children.set(todo.parentId, group);
  }
  const build = (todo: TodoWithParent, ancestors: Set<string>): Todo => {
    const { parentId: _drop, ...fields } = todo;
    void _drop;
    if (ancestors.has(todo.id)) return { ...fields, subtasks: [] };
    const nextAncestors = new Set(ancestors).add(todo.id);
    return {
      ...fields,
      subtasks: (children.get(todo.id) ?? []).map((child) => build(child, nextAncestors)),
    };
  };
  return (children.get(null) ?? []).map((todo) => build(todo, new Set()));
}

/**
 * 组装完整的 TaskFolder（含 todos/materials/timeline/agentConfig）
 */
export function getFolderDetail(folderId: string): TaskFolder | null {
  const folder = FolderRepository.findById(folderId);
  if (!folder) return null;

  const todosWithParent = TodoRepository.listByFolderWithParent(folderId);
  const todos = buildTodoTree(todosWithParent);

  const materials = MaterialRepository.listByFolder(folderId);
  const timeline = TimelineRepository.listByFolder(folderId);
  const agentConfig = AgentConfigRepository.findByFolder(folderId);

  folder.todos = todos;
  folder.materials = materials;
  folder.timeline = timeline;
  folder.agentConfig = agentConfig ?? {
    enabled: false,
    strategy: "follow_up",
    permissions: { read: true, write: false, notify: false, create_subtask: false },
    lastAction: null,
    workflowId: null,
  };

  return folder;
}

/**
 * 组装所有 folder 的完整数据（用于列表页 + 详情页）
 * 注意：这会一次性查出所有 folder + 所有关联数据
 * 数据量小（个人任务管理）时 OK，未来数据量大会改成按需懒加载
 */
export function getAllFoldersWithDetails(): TaskFolder[] {
  const folders = FolderRepository.list();
  return folders
    .map((f) => getFolderDetail(f.id))
    .filter((f): f is TaskFolder => f !== null);
}
