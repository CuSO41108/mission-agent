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
  const topLevel = allTodos.filter((t) => t.parentId === null);
  return topLevel.map((parent) => {
    const { parentId: _drop, ...parentFields } = parent;
    void _drop; // 丢弃 parentId 字段，转回 Todo 类型
    return {
      ...parentFields,
      subtasks: allTodos
        .filter((child) => child.parentId === parent.id)
        .map((child) => {
          const { parentId: _drop2, ...childFields } = child;
          void _drop2;
          return { ...childFields, subtasks: [] };
        }),
    };
  });
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
