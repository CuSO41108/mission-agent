import { AsyncLocalStorage } from "node:async_hooks";
import type { Assignee, FolderStatus, WorkflowTriggerType } from "../../renderer/types";

export interface WorkflowEvent {
  type: WorkflowTriggerType;
  folderId: string | null;
  todoId?: string;
  materialId?: string;
  text?: string;
  assignee?: Assignee;
  status?: FolderStatus;
  timestamp: number;
}

export interface WorkflowTrace {
  chainId: string;
  depth: number;
  visitedWorkflowIds: string[];
}

type Listener = (event: WorkflowEvent, trace: WorkflowTrace) => void | Promise<void>;
const listeners = new Set<Listener>();
const traceStorage = new AsyncLocalStorage<WorkflowTrace>();
const MAX_WORKFLOW_DEPTH = 8;

function newTrace(): WorkflowTrace {
  return {
    chainId: `chain-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    depth: 0,
    visitedWorkflowIds: [],
  };
}

export function onWorkflowEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentWorkflowTrace(): WorkflowTrace | undefined {
  return traceStorage.getStore();
}

export function withWorkflowTrace<T>(trace: WorkflowTrace, callback: () => T): T {
  return traceStorage.run(trace, callback);
}

export function emitWorkflowEvent(event: WorkflowEvent, trace = currentWorkflowTrace() ?? newTrace()): void {
  if (trace.depth >= MAX_WORKFLOW_DEPTH) {
    console.warn(`[workflow] 已阻止超过 ${MAX_WORKFLOW_DEPTH} 层的执行链 ${trace.chainId}`);
    return;
  }
  for (const listener of listeners) {
    void Promise.resolve(listener(event, trace)).catch((error) => {
      console.error("[workflow] 事件处理失败：", error);
    });
  }
}
