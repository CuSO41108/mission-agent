// Agent Service · 单舱 Agent 执行器
// 业务规则由待办类型、托管策略和权限共同决定；模型配置由 main 进程注入。

import path from "node:path";
import { chat, type ChatMessage } from "../config/deepseekClient";
import { withModelCapacity } from "./modelCapacity";
import type { DeepSeekConfig } from "../config/defaultConfig";
import { AgentConfigRepository } from "../repositories/agentConfigRepository";
import { FolderRepository } from "../repositories/folderRepository";
import { MaterialRepository } from "../repositories/materialRepository";
import { TimelineRepository } from "../repositories/timelineRepository";
import { TodoRepository } from "../repositories/todoRepository";
import { getDb } from "../db/client";
import { getFolderDetail } from "../services/folderService";
import { emitWorkflowEvent } from "../workflow/events";
import {
  commitStagedArtifact,
  discardStagedArtifact,
  prepareMaterialTask,
  stageArtifact,
  type MaterialTaskContext,
  type StagedArtifact,
} from "./materialTask";
import type { ArtifactFormat, TaskFolder, Todo, WorkflowRun } from "../../renderer/types";

export interface AgentResult {
  folderId: string;
  folderName: string;
  summary: string;
  action: string;
  suggestions?: string[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  ok: boolean;
  error?: string;
  errorCode?: string;
  artifactPath?: string;
  todoId?: string;
}

export interface AgentRunOptions {
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  artifactRoot?: string;
  notify?: (payload: { title: string; body: string; folderId: string }) => void;
  runWorkflow?: (workflowId: string, folderId: string) => Promise<WorkflowRun>;
  /** Agent Run 与 Copilot 共享的模型并发额度。 */
  modelConcurrency?: number;
  modelCapacityKey?: string;
}

function flattenTodos(todos: Todo[]): Todo[] {
  const result: Todo[] = [];
  const visit = (items: Todo[]) => {
    for (const todo of items) {
      result.push(todo);
      visit(todo.subtasks);
    }
  };
  visit(todos);
  return result;
}

function nextAgentTodo(folder: TaskFolder): Todo | null {
  return flattenTodos(folder.todos).find((todo) => todo.assignee === "agent" && !todo.done) ?? null;
}

function formatLabel(format: ArtifactFormat): string {
  if (format === "json") return "JSON";
  if (format === "text") return "纯文本";
  return "Markdown";
}

function buildHeartbeatSystemPrompt(folder: TaskFolder): string {
  const strategyInstruction = {
    follow_up: "检查临近截止或停滞事项，给出一条适合在应用内提醒的跟进建议。",
    material_collect: "只检查当前任务舱已经挂载的本地材料，指出缺失项；不要声称读取了邮箱或第三方服务。",
    progress_sync: "根据当前待办和时间线生成简短的本地进度摘要；不要声称已经同步到第三方。",
    custom: "根据当前任务舱信息给出简短判断。",
  }[folder.agentConfig.strategy];
  return [
    "你是 Mission Console 本地任务客户端中的任务 Agent。",
    strategyInstruction,
    "用 1-3 句话给出忠于现有数据的判断。",
    "建议动作可写成 [建议: xxx]；不要虚构外部连接、消息或材料。",
    "不要输出 JSON 或代码块，控制在 180 字以内。",
  ].join("\n");
}

function buildTaskSystemPrompt(todo: Todo, format: ArtifactFormat): string {
  switch (todo.agentTaskType ?? "analysis") {
    case "artifact":
      return [
        "你是 Mission Console 的本地产物生成 Agent。",
        `根据待办和材料生成完整的${formatLabel(format)}产物。`,
        "忠于材料，不虚构事实；只返回产物正文，不解释过程，也不要用代码块包裹全文。",
      ].join("\n");
    case "material_organize":
      return [
        "你是 Mission Console 的本地材料整理 Agent。",
        `把已挂载材料整理为结构清晰的${formatLabel(format)}清单或摘要。`,
        "注明材料名称和已知来源，不访问或声称访问第三方服务。只返回产物正文。",
      ].join("\n");
    case "progress_summary":
      return [
        "你是 Mission Console 的进度总结 Agent。",
        `按已完成、进行中、风险、下一步生成${formatLabel(format)}进度摘要。`,
        "仅使用提供的数据，不声称已发送或同步到第三方。只返回产物正文。",
      ].join("\n");
    case "follow_up":
      return [
        "你是 Mission Console 的跟进 Agent。",
        "根据待办和截止时间写一条简洁、具体、不过度施压的应用内提醒。",
        "只返回提醒正文，不声称已经发送到邮件、飞书或其他外部服务。",
      ].join("\n");
    case "analysis":
    default:
      return [
        "你是 Mission Console 的任务分析 Agent。",
        "围绕指定待办分析现状、风险和下一步；不要生成文件，也不要声称任务已经完成。",
        "用简洁自然语言回答，可使用短列表。",
      ].join("\n");
  }
}

function buildFolderContext(folder: TaskFolder): string {
  const todos = flattenTodos(folder.todos);
  return [
    `任务舱：${folder.name}`,
    `分类：${folder.category || "未分类"}`,
    `优先级：${folder.priority}`,
    `状态：${folder.status}`,
    `进度：${folder.progress}%`,
    `截止：${folder.deadline ? new Date(folder.deadline).toLocaleString("zh-CN") : "无"}`,
    "",
    "待办：",
    todos.length
      ? todos.map((item) => `- [${item.done ? "x" : " "}] ${item.title}（${item.assignee}）`).join("\n")
      : "（无待办）",
    "",
    "材料：",
    folder.materials.length
      ? folder.materials.map((item) => `- ${item.type}: ${item.name}`).join("\n")
      : "（无材料）",
  ].join("\n");
}

export function buildUserMessage(folder: TaskFolder): string {
  return `${buildFolderContext(folder)}\n\n请给出本次心跳巡检判断。`;
}

function buildTaskUserMessage(folder: TaskFolder, task: MaterialTaskContext): string {
  const imageInstruction = task.format === "markdown" && task.imageReferences.length
    ? task.imageReferences
        .map(({ name, markdownTarget }) => `- ${name}：可在合适位置使用 ![描述](${markdownTarget})`)
        .join("\n")
    : "（当前格式无需嵌入图片）";
  return [
    buildFolderContext(folder),
    "",
    `当前待办：${task.todo.title}`,
    `产物格式：${formatLabel(task.format)}`,
    "",
    "图片引用：",
    imageInstruction,
    "",
    "可读取的文本材料：",
    task.sourceText || "（没有文本材料，请仅基于任务舱与待办信息处理）",
  ].join("\n");
}

function failure(folder: TaskFolder, action: string, error: string, errorCode: string, todo?: Todo): AgentResult {
  writeTimeline(folder.id, "system", error, { todoId: todo?.id, errorCode });
  return {
    folderId: folder.id,
    folderName: folder.name,
    summary: error,
    action,
    ok: false,
    error,
    errorCode,
    todoId: todo?.id,
  };
}

function finishTodo(folderId: string, todo: Todo): void {
  if (!TodoRepository.toggleDone(folderId, todo.id, true)) {
    throw new Error("Agent 待办不存在或不属于当前任务舱");
  }
  recalculateFolderProgress(folderId);
}

function recalculateFolderProgress(folderId: string): void {
  const todos = TodoRepository.listByFolder(folderId);
  const doneCount = todos.filter((item) => item.done).length;
  FolderRepository.updateProgress(folderId, Math.round((doneCount / Math.max(todos.length, 1)) * 100));
}

function createRequestedSubtasks(folder: TaskFolder, todo: Todo | null, content: string): Array<{ id: string; title: string }> {
  if (!folder.agentConfig.permissions.create_subtask || !folder.agentConfig.permissions.write) return [];
  const titles = Array.from(content.matchAll(/\[子任务[:：]\s*([^\]]+)\]/g), (match) => match[1].trim())
    .filter(Boolean)
    .slice(0, 5);
  if (titles.length === 0) return [];
  const existing = new Set(flattenTodos(folder.todos).map((item) => item.title.trim().toLocaleLowerCase()));
  const created: Array<{ id: string; title: string }> = [];
  for (const title of titles) {
    if (existing.has(title.toLocaleLowerCase())) continue;
    const newTodo: Todo = {
      id: `todo-agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      folderId: folder.id,
      title,
      done: false,
      dueDate: null,
      assignee: "human",
      subtasks: [],
      source: `agent:${todo?.id ?? "heartbeat"}`,
    };
    TodoRepository.insert(newTodo, todo?.id ?? null);
    existing.add(title.toLocaleLowerCase());
    created.push({ id: newTodo.id, title });
  }
  return created;
}

export async function runAgentOnce(
  folderId: string,
  config: DeepSeekConfig,
  options: AgentRunOptions = {},
): Promise<AgentResult> {
  const folder = getFolderDetail(folderId);
  if (!folder) {
    return { folderId, folderName: "(未知)", summary: "任务舱不存在", action: "skip", ok: false, error: "任务舱不存在", errorCode: "FOLDER_NOT_FOUND" };
  }

  const todo = nextAgentTodo(folder);
  if ((todo?.agentTaskType === "workflow" || (!todo && folder.agentConfig.strategy === "custom"))) {
    const workflowId = todo?.workflowId ?? folder.agentConfig.workflowId;
    if (!workflowId || !options.runWorkflow) {
      return failure(folder, "workflow_missing", "未选择可执行的工作流", "WORKFLOW_REQUIRED", todo ?? undefined);
    }
    try {
      const run = await options.runWorkflow(workflowId, folder.id);
      if (run.status !== "success") throw new Error(run.message || "工作流执行失败");
      if (todo) {
        if (!folder.agentConfig.permissions.write) {
          return failure(folder, "task_permission_denied", "Agent 缺少写入权限，不能完成工作流待办", "AGENT_WRITE_PERMISSION_REQUIRED", todo);
        }
        finishTodo(folder.id, todo);
        emitWorkflowEvent({ type: "todo_completed", folderId, todoId: todo.id, text: todo.title, assignee: todo.assignee, timestamp: Date.now() });
      }
      writeTimeline(folderId, "agent", `工作流执行完成：${run.message || workflowId}`, { workflowId, todoId: todo?.id });
      updateLastAction(folderId);
      return { folderId, folderName: folder.name, summary: run.message || "工作流执行完成", action: "workflow_completed", ok: true, todoId: todo?.id };
    } catch (caught) {
      return failure(folder, "workflow_error", `工作流执行失败：${caught instanceof Error ? caught.message : String(caught)}`, "WORKFLOW_ERROR", todo ?? undefined);
    }
  }

  if (!folder.agentConfig.permissions.read) {
    return failure(folder, "task_permission_denied", "Agent 缺少读取权限，不能把任务舱上下文发送给模型", "AGENT_READ_PERMISSION_REQUIRED", todo ?? undefined);
  }
  if (!config.apiKey) {
    return failure(folder, "model_not_configured", "尚未配置模型 API Key，未执行 Agent", "MODEL_NOT_CONFIGURED", todo ?? undefined);
  }

  const writesArtifact = todo && ["artifact", "material_organize", "progress_summary"].includes(todo.agentTaskType ?? "analysis");
  const completesTodo = todo && todo.agentTaskType !== "analysis";
  if ((writesArtifact || completesTodo) && !folder.agentConfig.permissions.write) {
    return failure(folder, "task_permission_denied", "Agent 缺少写入权限，不能生成产物或完成待办", "AGENT_WRITE_PERMISSION_REQUIRED", todo ?? undefined);
  }
  if (todo?.agentTaskType === "follow_up" && !folder.agentConfig.permissions.notify) {
    return failure(folder, "task_permission_denied", "Agent 缺少通知权限，不能执行跟进提醒待办", "AGENT_NOTIFY_PERMISSION_REQUIRED", todo);
  }

  if (writesArtifact && !options.artifactRoot) {
    return failure(folder, "artifact_storage_not_configured", "Agent 产物目录尚未配置，未生成文件", "ARTIFACT_STORAGE_NOT_CONFIGURED", todo ?? undefined);
  }

  const task = todo ? prepareMaterialTask(folder, todo, options.artifactRoot) : null;
  const messages: ChatMessage[] = todo && task
    ? [
        { role: "system", content: buildTaskSystemPrompt(todo, task.format) },
        { role: "user", content: buildTaskUserMessage(folder, task) },
      ]
    : [
        { role: "system", content: buildHeartbeatSystemPrompt(folder) },
        { role: "user", content: buildUserMessage(folder) },
      ];
  if (folder.agentConfig.permissions.create_subtask && folder.agentConfig.permissions.write) {
    messages[0] = {
      ...messages[0],
      content: `${messages[0].content}\n如果确实需要新增后续事项，可在正文末尾使用 [子任务: 标题]；最多 5 条，不要重复现有待办。`,
    };
  }

  try {
    const result = await withModelCapacity(
      options.modelCapacityKey ?? `${config.baseUrl}|${config.model}`,
      options.modelConcurrency ?? 1,
      () => chat(config, messages, {
        signal: options.signal,
        timeoutMs: options.requestTimeoutMs,
        maxTokens: writesArtifact ? 4096 : 1024,
      }),
      options.signal,
    );
    let artifactPath: string | undefined;
    let stagedArtifact: StagedArtifact | undefined;
    let artifactFinalized = false;
    let createdSubtasks: Array<{ id: string; title: string }> = [];
    const db = getDb();
    db.exec("BEGIN;");
    try {
      if (writesArtifact && task && todo) {
        stagedArtifact = stageArtifact(folder, task, result.content);
        artifactPath = stagedArtifact.outputPath;
        const materialId = `m-agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        MaterialRepository.insert({
          id: materialId,
          folderId,
          type: "doc",
          name: path.basename(artifactPath),
          content: artifactPath,
          addedAt: Date.now(),
          sourceIntegration: "agent",
        });
      }
      if (completesTodo && todo) finishTodo(folderId, todo);
      createdSubtasks = createRequestedSubtasks(folder, todo, result.content);
      if (createdSubtasks.length > 0) recalculateFolderProgress(folderId);
      const action = artifactPath
        ? `完成待办并生成${formatLabel(task!.format)}产物：${path.basename(artifactPath)}`
        : todo?.agentTaskType === "follow_up"
          ? `生成应用内跟进提醒：${result.content.slice(0, 100)}`
          : todo
            ? `分析待办：${todo.title}`
            : `心跳巡检：${result.content.slice(0, 100)}`;
      writeTimeline(folderId, "agent", action, { todoId: todo?.id, artifactPath, model: result.model, tokens: result.usage?.totalTokens, createdSubtasks: createdSubtasks.map((item) => item.title) });
      updateLastAction(folderId);
      if (stagedArtifact) {
        commitStagedArtifact(stagedArtifact);
        artifactFinalized = true;
      }
      db.exec("COMMIT;");
    } catch (caught) {
      db.exec("ROLLBACK;");
      if (stagedArtifact) discardStagedArtifact(stagedArtifact, artifactFinalized);
      throw caught;
    }

    if (todo?.agentTaskType === "follow_up") {
      options.notify?.({ title: folder.name, body: result.content, folderId });
    } else if (!todo && folder.agentConfig.strategy === "follow_up" && folder.agentConfig.permissions.notify) {
      options.notify?.({ title: `${folder.name} · Agent 跟进`, body: result.content, folderId });
    }
    if (todo && completesTodo) {
      emitWorkflowEvent({ type: "todo_completed", folderId, todoId: todo.id, text: todo.title, assignee: todo.assignee, timestamp: Date.now() });
    }
    for (const subtask of createdSubtasks) {
      emitWorkflowEvent({ type: "todo_created", folderId, todoId: subtask.id, text: subtask.title, assignee: "human", timestamp: Date.now() });
    }
    if (artifactPath) {
      emitWorkflowEvent({ type: "material_added", folderId, text: path.basename(artifactPath), timestamp: Date.now() });
    }
    return {
      folderId,
      folderName: folder.name,
      summary: artifactPath ? `已生成${formatLabel(task!.format)}产物：${artifactPath}` : result.content,
      action: artifactPath ? "artifact_completed" : todo?.agentTaskType === "follow_up" ? "follow_up_completed" : todo ? "task_analyzed" : "heartbeat_llm",
      suggestions: extractSuggestions(result.content),
      usage: result.usage,
      ok: true,
      artifactPath,
      todoId: todo?.id,
    };
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    const timedOut = error.includes("请求超时");
    const cancelled = error.includes("请求已取消");
    return failure(
      folder,
      timedOut ? "model_timeout" : cancelled ? "run_cancelled" : "model_error",
      `${todo ? "任务执行" : "心跳巡检"}失败：${error}`,
      timedOut ? "MODEL_TIMEOUT" : cancelled ? "RUN_CANCELLED" : "MODEL_ERROR",
      todo ?? undefined,
    );
  }
}

function extractSuggestions(text: string): string[] {
  return Array.from(text.matchAll(/\[建议[:：]\s*([^\]]+)\]/g), (match) => match[1].trim());
}

function writeTimeline(folderId: string, actor: "human" | "agent" | "system", action: string, meta?: Record<string, unknown>): void {
  TimelineRepository.insert({
    id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    folderId,
    actor,
    action,
    timestamp: Date.now(),
    meta,
  });
}

function updateLastAction(folderId: string): void {
  const config = AgentConfigRepository.findByFolder(folderId);
  if (config) AgentConfigRepository.upsert(folderId, { ...config, lastAction: Date.now() });
}
