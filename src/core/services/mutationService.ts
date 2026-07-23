// Mutation Service · 写操作业务层
// 职责：把 UI 的写操作（toggleTodo / setFolderStatus / addMaterial 等）
//       转成 Repository 调用 + 写 timeline（保留操作痕迹）
// 零 electron 依赖

import { FolderRepository } from "../repositories/folderRepository";
import { TodoRepository } from "../repositories/todoRepository";
import { MaterialRepository } from "../repositories/materialRepository";
import { AgentConfigRepository } from "../repositories/agentConfigRepository";
import { WorkflowRepository } from "../repositories/workflowRepository";
import { TimelineRepository } from "../repositories/timelineRepository";
import { getDb } from "../db/client";
import { getFolderDetail } from "./folderService";
import { emitWorkflowEvent } from "../workflow/events";
import type {
  CreateFolderInput,
  CreateTodoInput,
  UpdateAgentConfigInput,
  TaskFolder,
  Material,
  FolderStatus,
  WorkflowRule,
} from "../../renderer/types";

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const COVER_BY_PRIORITY: Record<CreateFolderInput["priority"], string> = {
  critical: "#FF6B6B",
  high: "#FFB547",
  medium: "#00E5D4",
  low: "#7FD1B9",
};

/**
 * 写一条 timeline 记录
 */
function logTimeline(
  folderId: string,
  actor: "human" | "agent" | "system",
  action: string,
  meta?: Record<string, unknown>,
): void {
  TimelineRepository.insert({
    id: `tl-${genId()}`,
    folderId,
    actor,
    action,
    timestamp: Date.now(),
    meta,
  });
}

function calculateFolderProgress(folderId: string): number {
  const todos = TodoRepository.listByFolder(folderId);
  const doneCount = todos.filter((todo) => todo.done).length;
  return Math.round((doneCount / Math.max(todos.length, 1)) * 100);
}

// ============ Folder 写操作 ============

export function createFolder(input: CreateFolderInput): TaskFolder {
  const name = input.name.trim();
  if (!name) throw new Error("任务舱名称不能为空");
  if (!(["critical", "high", "medium", "low"] as const).includes(input.priority)) {
    throw new Error("任务舱优先级无效");
  }
  const deadline = input.deadline === null ? null : Number(input.deadline);
  if (deadline !== null && (!Number.isFinite(deadline) || deadline <= 0)) {
    throw new Error("截止时间无效");
  }

  const folderId = `f-${genId()}`;
  const folder: TaskFolder = {
    id: folderId,
    name,
    category: input.category.trim(),
    priority: input.priority,
    status: "active",
    deadline,
    progress: 0,
    coverColor: COVER_BY_PRIORITY[input.priority],
    createdAt: Date.now(),
    todos: [],
    materials: [],
    timeline: [],
    agentConfig: {
      enabled: input.agentEnabled === true,
      strategy: "follow_up",
      permissions: { read: true, write: false, notify: false, create_subtask: false },
      lastAction: null,
      workflowId: null,
    },
  };

  const db = getDb();
  db.exec("BEGIN;");
  try {
    FolderRepository.insert(folder);
    AgentConfigRepository.upsert(folderId, folder.agentConfig);
    logTimeline(folderId, "human", `创建任务舱：${name}`);
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  const created = getFolderDetail(folderId);
  if (!created) throw new Error("任务舱创建后读取失败");
  return created;
}

/** 永久删除数据库记录；材料仅为引用，不删除用户磁盘上的源文件。 */
export function deleteFolder(folderId: string): boolean {
  const folder = FolderRepository.findById(folderId);
  if (!folder) return false;
  if (folder.status !== "archived") {
    throw new Error("永久删除前必须先归档任务舱");
  }
  FolderRepository.delete(folderId);
  return FolderRepository.findById(folderId) === null;
}

/**
 * 更新 folder 状态
 * - 写入 folders 表
 * - 写 timeline
 * - 如果是 done，自动把 progress 设为 100
 */
export function setFolderStatus(
  folderId: string,
  status: FolderStatus,
  actor: "human" | "agent" | "system" = "human",
): TaskFolder | null {
  const folder = FolderRepository.findById(folderId);
  if (!folder) throw new Error("任务舱不存在");
  if (!("active paused done archived".split(" ") as FolderStatus[]).includes(status)) {
    throw new Error("任务舱状态无效");
  }
  const db = getDb();
  db.exec("BEGIN;");
  try {
    FolderRepository.updateStatus(folderId, status);
    FolderRepository.updateProgress(folderId, calculateFolderProgress(folderId));
    logTimeline(folderId, actor, `状态变更为 ${status}`, { status });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  const updated = getFolderDetail(folderId);
  emitWorkflowEvent({
    type: "folder_status_changed",
    folderId,
    status,
    timestamp: Date.now(),
  });
  return updated;
}

// ============ Todo 写操作 ============

export function createTodo(
  folderId: string,
  input: CreateTodoInput,
  actor: "human" | "agent" | "system" = "human",
): TaskFolder {
  const folder = FolderRepository.findById(folderId);
  if (!folder) throw new Error("任务舱不存在");
  if (folder.status === "archived") throw new Error("已归档任务舱不能添加待办");

  const title = input.title.trim();
  if (!title) throw new Error("待办标题不能为空");
  if (input.assignee !== "human" && input.assignee !== "agent") {
    throw new Error("待办负责人无效");
  }
  const dueDate = input.dueDate === null ? null : Number(input.dueDate);
  if (dueDate !== null && (!Number.isFinite(dueDate) || dueDate <= 0)) {
    throw new Error("待办截止时间无效");
  }
  const parentId = input.parentId ?? null;
  if (parentId) {
    const parent = TodoRepository.findById(parentId);
    if (!parent || parent.folderId !== folderId) {
      throw new Error("父待办不存在或不属于当前任务舱");
    }
  }

  const todo = {
    id: `todo-${genId()}`,
    folderId,
    title,
    done: false,
    dueDate,
    assignee: input.assignee,
    subtasks: [],
    source: input.source?.trim() || undefined,
    agentTaskType: input.assignee === "agent" ? input.agentTaskType ?? "analysis" : undefined,
    artifactFormat: input.assignee === "agent" ? input.artifactFormat ?? "markdown" : undefined,
    workflowId: input.assignee === "agent" ? input.workflowId ?? null : null,
  };
  const db = getDb();
  db.exec("BEGIN;");
  try {
    TodoRepository.insert(todo, parentId);
    FolderRepository.updateProgress(folderId, calculateFolderProgress(folderId));
    logTimeline(folderId, actor, `添加待办：${title}`, {
      todoId: todo.id,
      assignee: todo.assignee,
      parentId,
    });
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
  const updated = getFolderDetail(folderId);
  if (!updated) throw new Error("添加待办后读取任务舱失败");
  emitWorkflowEvent({
    type: "todo_created",
    folderId,
    todoId: todo.id,
    text: todo.title,
    assignee: todo.assignee,
    timestamp: Date.now(),
  });
  return updated;
}

/**
 * 切换 todo 完成状态
 * - 更新 todos 表
 * - 重算 folder 进度（已完成 todo / 总 todo）
 * - 写 timeline
 */
export function toggleTodo(folderId: string, todoId: string, done: boolean): TaskFolder {
  const db = getDb();
  db.exec("BEGIN;");
  try {
    if (!TodoRepository.toggleDone(folderId, todoId, done)) {
      throw new Error("待办不存在或不属于当前任务舱");
    }
    const progress = calculateFolderProgress(folderId);
    FolderRepository.updateProgress(folderId, progress);
    logTimeline(folderId, "human", `${done ? "完成" : "取消完成"}待办`, {
      todoId,
      done,
      progress,
    });
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
  const updated = getFolderDetail(folderId);
  if (!updated) throw new Error("更新待办后读取任务舱失败");
  if (done) {
    const todo = TodoRepository.findById(todoId);
    emitWorkflowEvent({
      type: "todo_completed",
      folderId,
      todoId,
      text: todo?.title,
      assignee: todo?.assignee,
      timestamp: Date.now(),
    });
  }
  return updated;
}

// ============ Material 写操作 ============

/**
 * 添加材料（引用模式：只记路径/URL，不复制文件）
 */
export function addMaterial(
  folderId: string,
  material: Omit<Material, "id" | "folderId" | "addedAt">,
): Material {
  const folder = FolderRepository.findById(folderId);
  if (!folder) throw new Error("任务舱不存在");
  if (folder.status === "archived") throw new Error("已归档任务舱不能添加材料");
  const name = material.name.trim();
  if (!name) throw new Error("材料名称不能为空");
  const newMaterial: Material = {
    ...material,
    name,
    id: `m-${genId()}`,
    folderId,
    addedAt: Date.now(),
  };
  const db = getDb();
  db.exec("BEGIN;");
  try {
    MaterialRepository.insert(newMaterial);
    logTimeline(folderId, "human", `添加材料：${name}`, {
      materialId: newMaterial.id,
      type: material.type,
    });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  emitWorkflowEvent({
    type: "material_added",
    folderId,
    materialId: newMaterial.id,
    text: newMaterial.name,
    timestamp: Date.now(),
  });
  return newMaterial;
}

/** 更新已有笔记材料；文件和链接引用不通过此入口修改。 */
export function updateNoteMaterial(folderId: string, materialId: string, content: string): Material {
  const folder = FolderRepository.findById(folderId);
  if (!folder) throw new Error("任务舱不存在");
  if (folder.status === "archived") throw new Error("已归档任务舱不能修改笔记");
  const note = MaterialRepository.listByFolder(folderId).find((material) => material.id === materialId);
  if (!note || note.type !== "note") throw new Error("笔记不存在或不属于当前任务舱");

  const db = getDb();
  db.exec("BEGIN;");
  try {
    if (!MaterialRepository.updateNote(folderId, materialId, content)) {
      throw new Error("笔记保存失败");
    }
    logTimeline(folderId, "human", "更新任务舱笔记", { materialId });
    db.exec("COMMIT;");
    return { ...note, content };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

/** 删除材料引用及其记录，不删除本地源文件。 */
export function deleteMaterial(folderId: string, materialId: string): boolean {
  const db = getDb();
  db.exec("BEGIN;");
  try {
    const deleted = MaterialRepository.delete(folderId, materialId);
    if (!deleted) throw new Error("材料不存在或不属于当前任务舱");
    logTimeline(folderId, "human", "删除材料引用", { materialId });
    db.exec("COMMIT;");
    return true;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

// ============ Agent 配置写操作 ============

/**
 * 切换 folder 的 Agent enabled 状态
 */
export function toggleAgent(folderId: string, enabled: boolean): TaskFolder {
  const folder = FolderRepository.findById(folderId);
  if (!folder) throw new Error("任务舱不存在");
  if (folder.status === "archived") throw new Error("已归档任务舱不能启用或暂停 Agent");
  const cfg = AgentConfigRepository.findByFolder(folderId);
  const db = getDb();
  db.exec("BEGIN;");
  try {
    if (cfg) {
      AgentConfigRepository.setEnabled(folderId, enabled);
    } else {
      // 没记录则 upsert 一条默认配置
      AgentConfigRepository.upsert(folderId, {
        enabled,
        strategy: "follow_up",
        permissions: { read: true, write: false, notify: false, create_subtask: false },
        lastAction: null,
        workflowId: null,
      });
    }
    logTimeline(folderId, "human", `${enabled ? "启用" : "暂停"} Agent`, { enabled });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  const updated = getFolderDetail(folderId);
  if (!updated) throw new Error("更新 Agent 状态后读取任务舱失败");
  return updated;
}

export function updateAgentConfig(
  folderId: string,
  input: UpdateAgentConfigInput,
): TaskFolder {
  const folder = FolderRepository.findById(folderId);
  if (!folder) throw new Error("任务舱不存在");
  const current = AgentConfigRepository.findByFolder(folderId) ?? {
    enabled: false,
    strategy: "follow_up" as const,
    permissions: { read: true, write: false, notify: false, create_subtask: false },
    lastAction: null,
  };
  const strategies = ["follow_up", "material_collect", "progress_sync", "custom"] as const;
  if (input.strategy && !strategies.includes(input.strategy)) {
    throw new Error("Agent 托管策略无效");
  }
  const permissions = { ...current.permissions };
  for (const [key, value] of Object.entries(input.permissions ?? {})) {
    if (!(key in permissions) || typeof value !== "boolean") {
      throw new Error("Agent 权限配置无效");
    }
    permissions[key as keyof typeof permissions] = value;
  }
  const db = getDb();
  db.exec("BEGIN;");
  try {
    AgentConfigRepository.upsert(folderId, {
      ...current,
      strategy: input.strategy ?? current.strategy,
      permissions,
      workflowId: input.workflowId === undefined ? current.workflowId ?? null : input.workflowId,
    });
    logTimeline(folderId, "human", "更新 Agent 配置", {
      strategy: input.strategy,
      permissions: input.permissions,
    });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  const updated = getFolderDetail(folderId);
  if (!updated) throw new Error("更新 Agent 配置后读取任务舱失败");
  return updated;
}

// ============ Workflow 写操作 ============

/**
 * 切换 workflow enabled 状态
 */
export function toggleWorkflow(workflowId: string, enabled: boolean): WorkflowRule {
  if (!WorkflowRepository.findById(workflowId)) throw new Error("工作流不存在");
  WorkflowRepository.setEnabled(workflowId, enabled);
  const updated = WorkflowRepository.findById(workflowId);
  if (!updated) throw new Error("更新工作流状态后读取失败");
  return updated;
}

/**
 * 记录 workflow 执行（runs+1, lastRun=now）
 */
export function recordWorkflowRun(workflowId: string): void {
  const wf = WorkflowRepository.findById(workflowId);
  if (!wf) return;
  WorkflowRepository.insert({
    ...wf,
    runs: wf.runs + 1,
    lastRun: Date.now(),
  });
}
