// Workflow Service · 心跳调度主逻辑
// 职责：扫描所有 enabled 舱体 → 调 AgentService → 收集结果
// 零 electron 依赖，由 main/scheduler.ts 调用，结果通过回调推送给 UI

import { FolderRepository } from "../repositories/folderRepository";
import { AgentConfigRepository } from "../repositories/agentConfigRepository";
import { TimelineRepository } from "../repositories/timelineRepository";
import {
  agentRunQueue,
  type AgentResult,
  type AgentRunOptions,
} from "../agent";
import type { AgentRunSource } from "../agent/runTypes";
import { getManualRunDenial, isHeartbeatEligible } from "./agentRunPolicy";

/**
 * 先持久化入队，再等待 Worker 在并发额度和任务舱资源都可用时自动执行。
 * 当前默认资源是 folder:<id>，因此同一任务舱串行；不同任务舱受限并行。
 */
async function runTrackedAgent(
  folderId: string,
  _folderName: string,
  source: AgentRunSource,
  deepseekConfig: { apiKey: string; baseUrl: string; model: string },
  options: AgentRunOptions,
): Promise<AgentResult> {
  const { signal, ...runtimeOptions } = options;
  return agentRunQueue.enqueueAndWait(
    { folderId, source },
    { config: deepseekConfig, options: runtimeOptions },
    signal,
  );
}

/**
 * 单次心跳的汇总结果
 */
export interface TickResult {
  timestamp: number;
  /** 扫描的舱体总数 */
  scanned: number;
  /** 实际跑 Agent 的舱体数（enabled=true） */
  executed: number;
  /** 成功数 */
  succeeded: number;
  /** 失败数 */
  failed: number;
  /** 每个舱体的详细结果 */
  results: AgentResult[];
  /** 总耗时（ms） */
  durationMs: number;
}

/**
 * 执行一次心跳巡检
 *
 * 流程：
 * 1. 拉取所有 folder
 * 2. 对每个 folder 检查 agent_config.enabled
 * 3. enabled 的 folder 按配置的上限并行执行；每个任务舱仍持有独占 Run 锁
 * 4. 返回 TickResult
 *
 * 注意：本函数不直接推送给 UI，由调用方（main/scheduler）拿结果后
 * 通过 webContents.send 推送，保持 core 零 electron 依赖
 *
 * @param deepseekConfig OpenAI 兼容模型配置（字段名为旧版兼容保留）
 */
export async function tick(deepseekConfig: {
  apiKey: string;
  baseUrl: string;
  model: string;
}, options: AgentRunOptions = {}): Promise<TickResult> {
  const start = Date.now();
  const folders = FolderRepository.list().filter((folder) => folder.status === "active");
  const eligible = folders.filter((folder) =>
    isHeartbeatEligible(folder, AgentConfigRepository.findByFolder(folder.id)),
  );
  // 一次性持久化所有符合条件的 Run；真正的并发控制由 AgentRunQueue 统一负责。
  // 这样即使资源暂时被占用，剩余任务也会留在 queued，而不是停在内存 worker 之外。
  const results = await Promise.all(eligible.map(async (folder): Promise<AgentResult> => {
    try {
      return await runTrackedAgent(folder.id, folder.name, "heartbeat", deepseekConfig, options);
    } catch (err) {
      return {
          folderId: folder.id,
          folderName: folder.name,
          summary: `巡检异常：${err instanceof Error ? err.message : String(err)}`,
          action: "heartbeat_exception",
          ok: false,
          error: err instanceof Error ? err.message : String(err),
      };
    }
  }));

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  return {
    timestamp: start,
    scanned: folders.length,
    executed: results.length,
    succeeded,
    failed,
    results,
    durationMs: Date.now() - start,
  };
}

/**
 * 手动触发单个舱体的 Agent（不等心跳）
 */
export async function runFolderAgent(
  folderId: string,
  deepseekConfig: { apiKey: string; baseUrl: string; model: string },
  options: AgentRunOptions = {},
  source: AgentRunSource = "manual",
): Promise<AgentResult> {
  const folder = FolderRepository.findById(folderId);
  const agentConfig = folder ? AgentConfigRepository.findByFolder(folderId) : null;
  const denial = getManualRunDenial(folder, agentConfig);
  if (denial) {
    return {
      folderId,
      folderName: folder?.name ?? "(未知)",
      summary: denial.message,
      action: "manual_run_denied",
      ok: false,
      error: denial.message,
      errorCode: denial.code,
    };
  }
  return runTrackedAgent(folderId, folder.name, source, deepseekConfig, options);
}

// 导出 TimelineRepository 供 main 使用（写 timeline）
export { TimelineRepository };
