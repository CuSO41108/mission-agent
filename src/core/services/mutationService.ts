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
import type {
  TaskFolder,
  Todo,
  Material,
  FolderStatus,
} from "../../renderer/types";

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

// ============ Folder 写操作 ============

/**
 * 更新 folder 状态
 * - 写入 folders 表
 * - 写 timeline
 * - 如果是 done，自动把 progress 设为 100
 */
export function setFolderStatus(
  folderId: string,
  status: FolderStatus,
): TaskFolder | null {
  FolderRepository.updateStatus(folderId, status);
  if (status === "done") {
    FolderRepository.updateProgress(folderId, 100);
  }
  logTimeline(folderId, "human", `状态变更为 ${status}`, { status });
  return FolderRepository.findById(folderId);
}

// ============ Todo 写操作 ============

/**
 * 切换 todo 完成状态
 * - 更新 todos 表
 * - 重算 folder 进度（已完成 todo / 总 todo）
 * - 写 timeline
 */
export function toggleTodo(folderId: string, todoId: string, done: boolean): void {
  TodoRepository.toggleDone(todoId, done);
  // 重算进度
  const todos = TodoRepository.listByFolder(folderId);
  const doneCount = todos.filter((t) => t.done).length;
  const progress = Math.round((doneCount / Math.max(todos.length, 1)) * 100);
  FolderRepository.updateProgress(folderId, progress);
  logTimeline(folderId, "human", `${done ? "完成" : "取消完成"}待办`, {
    todoId,
    done,
    progress,
  });
}

// ============ Material 写操作 ============

/**
 * 添加材料（引用模式：只记路径/URL，不复制文件）
 */
export function addMaterial(
  folderId: string,
  material: Omit<Material, "id" | "folderId" | "addedAt">,
): Material {
  const newMaterial: Material = {
    ...material,
    id: `m-${genId()}`,
    folderId,
    addedAt: Date.now(),
  };
  MaterialRepository.insert(newMaterial);
  logTimeline(folderId, "human", `添加材料：${material.name}`, {
    materialId: newMaterial.id,
    type: material.type,
  });
  return newMaterial;
}

// ============ Agent 配置写操作 ============

/**
 * 切换 folder 的 Agent enabled 状态
 */
export function toggleAgent(folderId: string, enabled: boolean): void {
  const cfg = AgentConfigRepository.findByFolder(folderId);
  if (cfg) {
    AgentConfigRepository.setEnabled(folderId, enabled);
  } else {
    // 没记录则 upsert 一条默认配置
    AgentConfigRepository.upsert(folderId, {
      enabled,
      strategy: "follow_up",
      permissions: { read: true, write: false, notify: false, create_subtask: false },
      lastAction: null,
    });
  }
  logTimeline(folderId, "human", `${enabled ? "启用" : "暂停"} Agent`, { enabled });
}

// ============ Workflow 写操作 ============

/**
 * 切换 workflow enabled 状态
 */
export function toggleWorkflow(workflowId: string, enabled: boolean): void {
  WorkflowRepository.setEnabled(workflowId, enabled);
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
