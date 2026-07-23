// 任务指挥中心 · 类型定义

export type Priority = "critical" | "high" | "medium" | "low";
export type FolderStatus = "active" | "paused" | "done" | "archived";
export type Assignee = "human" | "agent";
export type Actor = "human" | "agent" | "system";
export type MaterialType = "doc" | "link" | "note" | "image" | "file";
export type AgentTaskType =
  | "analysis"
  | "artifact"
  | "follow_up"
  | "material_organize"
  | "progress_summary"
  | "workflow";
export type ArtifactFormat = "markdown" | "text" | "json";
export type AgentStrategy =
  | "follow_up"
  | "material_collect"
  | "progress_sync"
  | "custom";

export interface Todo {
  id: string;
  folderId: string;
  title: string;
  done: boolean;
  dueDate: number | null;
  assignee: Assignee;
  subtasks: Todo[];
  source?: string;
  agentTaskType?: AgentTaskType;
  artifactFormat?: ArtifactFormat;
  workflowId?: string | null;
}

export interface CreateTodoInput {
  title: string;
  dueDate: number | null;
  assignee: Assignee;
  parentId?: string | null;
  source?: string;
  agentTaskType?: AgentTaskType;
  artifactFormat?: ArtifactFormat;
  workflowId?: string | null;
}

export interface Material {
  id: string;
  folderId: string;
  type: MaterialType;
  name: string;
  content: string;
  sourceIntegration?: string;
  addedAt: number;
}

export interface AgentConfig {
  enabled: boolean;
  strategy: AgentStrategy;
  permissions: {
    read: boolean;
    write: boolean;
    notify: boolean;
    create_subtask: boolean;
  };
  lastAction: number | null;
  workflowId?: string | null;
}

export interface UpdateAgentConfigInput {
  strategy?: AgentStrategy;
  permissions?: Partial<AgentConfig["permissions"]>;
  workflowId?: string | null;
}

export interface TimelineEntry {
  id: string;
  folderId: string;
  actor: Actor;
  action: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

export interface TaskFolder {
  id: string;
  name: string;
  category: string;
  priority: Priority;
  status: FolderStatus;
  deadline: number | null;
  progress: number; // 0-100
  coverColor: string;
  todos: Todo[];
  materials: Material[];
  agentConfig: AgentConfig;
  timeline: TimelineEntry[];
  createdAt: number;
  sourceIntegration?: string;
}

export interface CreateFolderInput {
  name: string;
  category: string;
  priority: Priority;
  deadline: number | null;
  agentEnabled?: boolean;
}

export type IntegrationType =
  | "email"
  | "calendar"
  | "social"
  | "chat"
  | "custom";
export type IntegrationStatus = "connected" | "disconnected" | "error" | "beta";
export type IntegrationAuthType = "none" | "api_key" | "oauth2" | "basic" | "webhook";
export type IntegrationSecretKey =
  | "apiKey"
  | "clientId"
  | "clientSecret"
  | "username"
  | "password"
  | "token";

export interface IntegrationConnectionConfig {
  provider: string;
  account: string;
  endpoint: string;
  imapHost: string;
  imapPort: number | null;
  smtpHost: string;
  smtpPort: number | null;
  webhookUrl: string;
  authType: IntegrationAuthType;
  secretConfigured: Record<IntegrationSecretKey, boolean>;
}

export interface IntegrationAdapter {
  id: string;
  type: IntegrationType;
  name: string;
  description: string;
  status: IntegrationStatus;
  lastSync: number | null;
  eventsToday: number;
  config: IntegrationConnectionConfig;
}

export interface UpsertIntegrationInput {
  name: string;
  type: IntegrationType;
  description: string;
  config: Omit<IntegrationConnectionConfig, "secretConfigured">;
  /** null 清除已有凭据；空字符串或缺省表示保持不变。 */
  secrets?: Partial<Record<IntegrationSecretKey, string | null>>;
}

export type WorkflowTriggerType =
  | "manual"
  | "schedule"
  | "todo_created"
  | "todo_completed"
  | "material_added"
  | "folder_status_changed";
export type WorkflowConditionField =
  | "folder_id"
  | "folder_priority"
  | "folder_status"
  | "assignee"
  | "keyword"
  | "deadline";
export type WorkflowConditionOperator = "eq" | "neq" | "contains" | "before" | "after";
export type WorkflowActionType =
  | "create_todo"
  | "set_folder_status"
  | "run_agent"
  | "write_timeline"
  | "notify";

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  label: string;
  intervalMin?: number;
  folderId?: string | null;
}

export interface WorkflowCondition {
  id: string;
  field: WorkflowConditionField;
  op: WorkflowConditionOperator;
  value: string;
}

export interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  label: string;
  config: {
    title?: string;
    assignee?: Assignee;
    status?: FolderStatus;
    message?: string;
    folderId?: string | null;
  };
}

export interface WorkflowNodeLayout {
  id: string;
  kind: "trigger" | "condition" | "action";
  refId: string;
  x: number;
  y: number;
}

export interface WorkflowRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  layout: WorkflowNodeLayout[];
  runs: number;
  lastRun: number | null;
  lastStatus: "success" | "failed" | null;
  lastError: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "success" | "failed" | "skipped";
  triggerType: WorkflowTriggerType;
  folderId: string | null;
  message: string;
  startedAt: number;
  finishedAt: number;
}

export interface UpsertWorkflowInput {
  name: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  layout: WorkflowNodeLayout[];
}

export interface AgentActivity {
  id: string;
  folderId: string;
  folderName: string;
  action: string;
  type: "sync" | "create" | "notify" | "update" | "warn";
  timestamp: number;
}

export type NotificationType = "info" | "success" | "warn" | "error";

export interface AgentNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  folderId?: string;
  source: "agent" | "integration" | "system";
  read: boolean;
  timestamp: number;
}

export interface CopilotReference {
  kind: "folder" | "todo" | "material" | "integration";
  id: string;
  label: string;
  meta?: string; // 例如 "剩余 6h"、"进度 62%"
}

export interface CopilotAction {
  id: string;
  label: string;
  variant: "primary" | "ghost";
  command: string; // 点击后回传给 store 的指令
  done?: boolean;
}

export interface CopilotThinking {
  summary: string; // 折叠时显示
  steps: string[]; // 展开后的推理步骤
}

export interface CopilotMeta {
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export type CopilotMode = "local" | "analysis" | "draft";

export interface CopilotFolderDraft {
  kind: "folder";
  summary: string;
  input: CreateFolderInput;
  todos: Array<Pick<CreateTodoInput, "title" | "assignee">>;
}

export interface CopilotWorkflowDraft {
  kind: "workflow";
  summary: string;
  input: UpsertWorkflowInput;
}

export type CopilotDraft = CopilotFolderDraft | CopilotWorkflowDraft;

export interface CopilotModelResult {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  draft?: CopilotDraft;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: number;
  // 以下为 agent 消息可选字段
  streaming?: boolean;
  references?: CopilotReference[];
  actions?: CopilotAction[];
  thinking?: CopilotThinking;
  meta?: CopilotMeta;
  draft?: CopilotDraft;
  draftStatus?: "pending" | "applied" | "cancelled" | "failed";
  draftError?: string;
}
