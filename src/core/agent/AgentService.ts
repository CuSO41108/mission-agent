// Agent Service · 单舱 Agent 执行器
// 职责：构造 prompt → 调 DeepSeek → 解析响应 → 写 timeline + 返回事件
// 零 electron 依赖，DeepSeek 配置由调用方传入

import { chat, type ChatMessage } from "../config/deepseekClient";
import type { DeepSeekConfig } from "../config/defaultConfig";
import { FolderRepository } from "../repositories/folderRepository";
import { TodoRepository } from "../repositories/todoRepository";
import { MaterialRepository } from "../repositories/materialRepository";
import { AgentConfigRepository } from "../repositories/agentConfigRepository";
import { TimelineRepository } from "../repositories/timelineRepository";
import type { TaskFolder } from "../../renderer/types";

/**
 * Agent 执行结果（用于推送给 UI 通知）
 */
export interface AgentResult {
  folderId: string;
  folderName: string;
  /** LLM 原始回复（人类可读的总结） */
  summary: string;
  /** 本次执行的简短动作标签 */
  action: string;
  /** 推荐动作（可选，例如"建议催办"） */
  suggestions?: string[];
  /** DeepSeek 用量（token 数等） */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 执行是否成功（false 时 summary 是错误描述） */
  ok: boolean;
  /** 错误信息（ok=false 时） */
  error?: string;
}

/**
 * 构造发送给 DeepSeek 的系统提示词
 * 告诉 LLM 它是任务舱的 Agent，应给出简短可执行的判断
 */
function buildSystemPrompt(): string {
  return [
    "你是 Mission Console 任务指挥中心的 Agent。",
    "职责：为单个任务舱（folder）做一次心跳巡检，给出简短的判断和建议。",
    "输出要求：",
    "- 用 1-3 句话总结当前状态",
    "- 如果有临近截止的待办，明确指出",
    "- 如果建议执行某动作（如催办、归档），用 [建议: xxx] 的形式列出",
    "- 不要输出 JSON 或代码块，只用自然语言",
    "- 控制在 150 字以内",
  ].join("\n");
}

/**
 * 构造用户消息：把任务舱的当前状态序列化给 LLM
 */
function buildUserMessage(folder: TaskFolder): string {
  const now = Date.now();
  const deadlineStr = folder.deadline
    ? `截止 ${new Date(folder.deadline).toLocaleString("zh-CN")}（剩余 ${Math.max(0, folder.deadline - now)} ms）`
    : "无截止时间";

  const todosStr = folder.todos.length
    ? folder.todos
        .map((t) => `- [${t.done ? "x" : " "}] ${t.title}${t.dueDate ? `（截止 ${new Date(t.dueDate).toLocaleString("zh-CN")}）` : ""}`)
        .join("\n")
    : "（无待办）";

  const materialsStr = folder.materials.length
    ? folder.materials.map((m) => `- ${m.type}: ${m.name}`).join("\n")
    : "（无材料）";

  return [
    `任务舱：${folder.name}`,
    `分类：${folder.category || "未分类"}`,
    `优先级：${folder.priority}`,
    `状态：${folder.status}`,
    `进度：${folder.progress}%`,
    `截止：${deadlineStr}`,
    ``,
    `待办列表：`,
    todosStr,
    ``,
    `材料列表：`,
    materialsStr,
    ``,
    `请基于以上信息，给出本次心跳的巡检判断。`,
  ].join("\n");
}

/**
 * 为单个任务舱执行一次 Agent 巡检
 *
 * 流程：
 * 1. 读取 folder 全量数据（todos / materials / agentConfig）
 * 2. 构造 prompt
 * 3. 调 DeepSeek
 * 4. 写 timeline（actor=agent）
 * 5. 更新 agent_config.last_action
 * 6. 返回 AgentResult（调用方决定是否推送给 UI）
 *
 * @param folderId 任务舱 ID
 * @param config DeepSeek 配置（API key 等）
 */
export async function runAgentOnce(
  folderId: string,
  config: DeepSeekConfig,
): Promise<AgentResult> {
  const folder = FolderRepository.findById(folderId);
  if (!folder) {
    return {
      folderId,
      folderName: "(未知)",
      summary: "任务舱不存在",
      action: "skip",
      ok: false,
      error: "folder not found",
    };
  }

  // 没有 API key 时跳过 LLM 调用，只做简单的本地巡检
  if (!config.apiKey) {
    const summary = `未配置 DeepSeek API key，跳过 LLM 巡检。${folder.name} 当前进度 ${folder.progress}%。`;
    writeTimeline(folderId, "agent", "心跳巡检（无 LLM）", { reason: "no_api_key" });
    updateLastAction(folderId);
    return {
      folderId,
      folderName: folder.name,
      summary,
      action: "heartbeat_no_llm",
      ok: true,
    };
  }

  // 调 DeepSeek
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildUserMessage(folder) },
  ];

  try {
    const result = await chat(config, messages);
    const summary = result.content;

    // 写 timeline + 更新 last_action
    writeTimeline(folderId, "agent", `心跳巡检：${summary.slice(0, 80)}`, {
      model: result.model,
      tokens: result.usage?.totalTokens,
    });
    updateLastAction(folderId);

    // 解析建议（[建议: xxx] 格式）
    const suggestions = extractSuggestions(summary);

    return {
      folderId,
      folderName: folder.name,
      summary,
      action: "heartbeat_llm",
      suggestions,
      usage: result.usage,
      ok: true,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    writeTimeline(folderId, "agent", `心跳巡检失败：${errorMsg}`, { error: errorMsg });
    updateLastAction(folderId);
    return {
      folderId,
      folderName: folder.name,
      summary: `巡检失败：${errorMsg}`,
      action: "heartbeat_error",
      ok: false,
      error: errorMsg,
    };
  }
}

/**
 * 从 LLM 回复中抽取 [建议: xxx] 形式的建议
 */
function extractSuggestions(text: string): string[] {
  const matches = text.matchAll(/\[建议[:：]\s*([^\]]+)\]/g);
  return Array.from(matches, (m) => m[1].trim());
}

/**
 * 写一条 timeline 记录
 */
function writeTimeline(
  folderId: string,
  actor: "human" | "agent" | "system",
  action: string,
  meta?: Record<string, unknown>,
): void {
  TimelineRepository.insert({
    id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    folderId,
    actor,
    action,
    timestamp: Date.now(),
    meta,
  });
}

/**
 * 更新 agent_config.last_action 时间戳
 */
function updateLastAction(folderId: string): void {
  const cfg = AgentConfigRepository.findByFolder(folderId);
  if (cfg) {
    AgentConfigRepository.upsert(folderId, { ...cfg, lastAction: Date.now() });
  }
}
