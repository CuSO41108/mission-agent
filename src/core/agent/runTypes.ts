/** 本地 Agent 运行队列的持久化状态。 */
export type AgentRunSource = "heartbeat" | "manual" | "workflow";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AgentRunRecord {
  id: string;
  folderId: string;
  /** 空值表示由心跳在运行时选择该任务舱的下一个 Agent 待办。 */
  todoId: string | null;
  source: AgentRunSource;
  status: AgentRunStatus;
  lockKey: string;
  queuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  summary: string | null;
  error: string | null;
  errorCode: string | null;
  model: string | null;
  /** 手动重试时指向原 Run；原记录保持不变，便于审计。 */
  retryOfRunId: string | null;
}

export interface EnqueueAgentRunInput {
  folderId: string;
  todoId?: string | null;
  source: AgentRunSource;
  /** 调度预检确定的互斥资源；当前默认按任务舱互斥。 */
  lockKey?: string;
  retryOfRunId?: string | null;
  model?: string | null;
}
