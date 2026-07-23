import { getDb } from "../db/client";
import { AgentConfigRepository } from "../repositories/agentConfigRepository";
import { FolderRepository } from "../repositories/folderRepository";
import { TimelineRepository } from "../repositories/timelineRepository";
import { TodoRepository } from "../repositories/todoRepository";
import { WorkflowRepository, WorkflowRunRepository } from "../repositories/workflowRepository";
import { createTodo, setFolderStatus } from "../services/mutationService";
import type {
  FolderStatus,
  WorkflowAction,
  WorkflowCondition,
  WorkflowRule,
  WorkflowRun,
} from "../../renderer/types";
import {
  onWorkflowEvent,
  withWorkflowTrace,
  type WorkflowEvent,
  type WorkflowTrace,
} from "./events";

export interface WorkflowRuntime {
  runAgent: (folderId: string) => Promise<{ ok: boolean; summary?: string; error?: string }>;
  notify: (payload: { title: string; body: string; folderId: string | null }) => void;
  changed: (folderIds: string[]) => void;
}

let runtime: WorkflowRuntime | null = null;
let unsubscribe: (() => void) | null = null;

export function registerWorkflowRuntime(nextRuntime: WorkflowRuntime): () => void {
  runtime = nextRuntime;
  unsubscribe?.();
  unsubscribe = onWorkflowEvent(async (event, trace) => dispatchWorkflowEvent(event, trace));
  return () => {
    unsubscribe?.();
    unsubscribe = null;
    runtime = null;
  };
}

function eventValue(condition: WorkflowCondition, event: WorkflowEvent): string | number | null {
  const folder = event.folderId ? FolderRepository.findById(event.folderId) : null;
  const todo = event.todoId ? TodoRepository.findById(event.todoId) : null;
  switch (condition.field) {
    case "folder_id": return event.folderId;
    case "folder_priority": return folder?.priority ?? null;
    case "folder_status": return event.status ?? folder?.status ?? null;
    case "assignee": return event.assignee ?? todo?.assignee ?? null;
    case "keyword": return event.text ?? todo?.title ?? "";
    case "deadline": return folder?.deadline ?? null;
  }
}

function conditionMatches(condition: WorkflowCondition, event: WorkflowEvent): boolean {
  const actual = eventValue(condition, event);
  if (actual === null) return false;
  switch (condition.op) {
    case "eq": return String(actual) === condition.value;
    case "neq": return String(actual) !== condition.value;
    case "contains": return String(actual).toLocaleLowerCase().includes(condition.value.toLocaleLowerCase());
    case "before": return Number(actual) < Number(condition.value);
    case "after": return Number(actual) > Number(condition.value);
  }
}

function triggerMatches(workflow: WorkflowRule, event: WorkflowEvent): boolean {
  if (!workflow.enabled || workflow.trigger.type !== event.type) return false;
  if (workflow.trigger.folderId && workflow.trigger.folderId !== event.folderId) return false;
  return workflow.conditions.every((condition) => conditionMatches(condition, event));
}

function resolveFolderId(workflow: WorkflowRule, action: WorkflowAction, event: WorkflowEvent): string {
  const folderId = action.config.folderId || event.folderId || workflow.trigger.folderId;
  if (!folderId || !FolderRepository.findById(folderId)) throw new Error("工作流动作缺少有效任务舱");
  return folderId;
}

async function executeAction(
  workflow: WorkflowRule,
  action: WorkflowAction,
  event: WorkflowEvent,
  changedFolderIds: Set<string>,
): Promise<string> {
  const folderId = resolveFolderId(workflow, action, event);
  changedFolderIds.add(folderId);
  switch (action.type) {
    case "create_todo": {
      const title = action.config.title?.trim() || action.label.trim();
      if (!title) throw new Error("创建待办动作缺少标题");
      createTodo(folderId, {
        title,
        dueDate: null,
        assignee: action.config.assignee ?? "human",
        source: `workflow:${workflow.id}`,
      }, "system");
      return `创建待办：${title}`;
    }
    case "set_folder_status": {
      const status = action.config.status as FolderStatus | undefined;
      if (!status) throw new Error("修改状态动作缺少目标状态");
      setFolderStatus(folderId, status, "system");
      return `任务舱状态改为 ${status}`;
    }
    case "run_agent": {
      if (!runtime) throw new Error("工作流运行时尚未注册");
      const config = AgentConfigRepository.findByFolder(folderId);
      if (!config?.enabled) throw new Error("目标任务舱的 Agent 未启用");
      const result = await runtime.runAgent(folderId);
      if (!result.ok) throw new Error(result.error || "Agent 执行失败");
      return result.summary || "Agent 执行完成";
    }
    case "write_timeline": {
      const message = action.config.message?.trim() || action.label;
      TimelineRepository.insert({
        id: `tl-wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        folderId,
        actor: "system",
        action: message,
        timestamp: Date.now(),
        meta: { workflowId: workflow.id },
      });
      return message;
    }
    case "notify": {
      if (!runtime) throw new Error("工作流运行时尚未注册");
      const message = action.config.message?.trim() || action.label;
      runtime.notify({ title: workflow.name, body: message, folderId });
      return `应用内通知：${message}`;
    }
  }
}

export async function runWorkflow(
  workflowId: string,
  event: WorkflowEvent,
  trace: WorkflowTrace = {
    chainId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    depth: 0,
    visitedWorkflowIds: [],
  },
): Promise<WorkflowRun> {
  const workflow = WorkflowRepository.findById(workflowId);
  if (!workflow) throw new Error("工作流不存在");
  if (trace.depth >= 8) throw new Error("已阻止超过 8 层的工作流执行链");
  if (trace.visitedWorkflowIds.includes(workflow.id)) throw new Error("已阻止工作流循环执行");
  const startedAt = Date.now();
  const changedFolderIds = new Set<string>();
  const messages: string[] = [];
  let status: WorkflowRun["status"] = "success";
  let error: string | null = null;
  const nextTrace: WorkflowTrace = {
    ...trace,
    depth: trace.depth + 1,
    visitedWorkflowIds: [...trace.visitedWorkflowIds, workflow.id],
  };

  try {
    await withWorkflowTrace(nextTrace, async () => {
      for (const action of workflow.actions) {
        messages.push(await executeAction(workflow, action, event, changedFolderIds));
      }
    });
  } catch (caught) {
    status = "failed";
    error = caught instanceof Error ? caught.message : String(caught);
    messages.push(error);
  }

  const run: WorkflowRun = {
    id: `wfr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    workflowId: workflow.id,
    status,
    triggerType: event.type,
    folderId: event.folderId,
    message: messages.join("；"),
    startedAt,
    finishedAt: Date.now(),
  };
  const db = getDb();
  db.exec("BEGIN;");
  try {
    WorkflowRunRepository.insert(run);
    WorkflowRepository.recordResult(workflow.id, status === "success" ? "success" : "failed", error);
    db.exec("COMMIT;");
  } catch (caught) {
    db.exec("ROLLBACK;");
    throw caught;
  }
  runtime?.changed([...changedFolderIds]);
  return run;
}

export async function dispatchWorkflowEvent(event: WorkflowEvent, trace: WorkflowTrace): Promise<void> {
  const workflows = WorkflowRepository.list().filter((workflow) => triggerMatches(workflow, event));
  for (const workflow of workflows) {
    if (trace.visitedWorkflowIds.includes(workflow.id)) continue;
    const run = await runWorkflow(workflow.id, event, trace);
    if (run.status === "failed") console.error(`[workflow] ${workflow.name} 执行失败：${run.message}`);
  }
}

export async function runDueScheduledWorkflows(now = Date.now()): Promise<WorkflowRun[]> {
  const due = WorkflowRepository.list().filter((workflow) => {
    if (!workflow.enabled || workflow.trigger.type !== "schedule") return false;
    const intervalMs = Math.max(5, workflow.trigger.intervalMin ?? 60) * 60_000;
    return workflow.lastRun === null || now - workflow.lastRun >= intervalMs;
  });
  const results: WorkflowRun[] = [];
  for (const workflow of due) {
    results.push(await runWorkflow(workflow.id, {
      type: "schedule",
      folderId: workflow.trigger.folderId ?? null,
      timestamp: now,
    }));
  }
  return results;
}
