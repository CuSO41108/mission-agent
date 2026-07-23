// Workflow Service · 心跳调度主逻辑
// 职责：扫描所有 enabled 舱体 → 调 AgentService → 收集结果
// 零 electron 依赖，由 main/scheduler.ts 调用，结果通过回调推送给 UI

import { FolderRepository } from "../repositories/folderRepository";
import { AgentConfigRepository } from "../repositories/agentConfigRepository";
import { TimelineRepository } from "../repositories/timelineRepository";
import { AgentRunRepository } from "../repositories/agentRunRepository";
import {
  runAgentOnce,
  type AgentResult,
  type AgentRunOptions,
} from "../agent";
import type { AgentRunSource } from "../agent/runTypes";
import { getManualRunDenial, isHeartbeatEligible } from "./agentRunPolicy";

function skippedRun(folderId: string, folderName: string, message: string): AgentResult {
  return {
    folderId,
    folderName,
    summary: message,
    action: "agent_run_busy",
    ok: false,
    error: message,
    errorCode: "AGENT_RUN_BUSY",
  };
}

/**
 * 执行前将 Run 与任务舱资源租约写入本地 SQLite。
 * 当前默认资源是 folder:<id>，因此同一任务舱始终串行；不同任务舱可受限并行。
 */
async function runTrackedAgent(
  folderId: string,
  folderName: string,
  source: AgentRunSource,
  deepseekConfig: { apiKey: string; baseUrl: string; model: string },
  options: AgentRunOptions,
): Promise<AgentResult> {
  const queued = AgentRunRepository.enqueue({ folderId, source });
  if (!queued.created) {
    return skippedRun(folderId, folderName, "该任务舱已有 Agent Run 在等待或执行中");
  }
  const run = AgentRunRepository.claim(queued.run.id);
  if (!run) {
    AgentRunRepository.cancelQueued(queued.run.id, "任务舱资源正被其他 Run 使用", "RESOURCE_BUSY");
    return skippedRun(folderId, folderName, "任务舱资源正被其他 Agent Run 使用");
  }
  try {
    const result = await runAgentOnce(folderId, deepseekConfig, options);
    AgentRunRepository.finish(run.id, result.ok ? "succeeded" : "failed", {
      summary: result.summary,
      error: result.error ?? null,
      errorCode: result.errorCode ?? null,
    });
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    AgentRunRepository.finish(run.id, "failed", {
      summary: `执行异常：${detail}`,
      error: detail,
      errorCode: "RUN_EXCEPTION",
    });
    throw error;
  }
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
  const results: AgentResult[] = [];
  const concurrency = Math.max(1, options.modelConcurrency ?? 1);
  let nextIndex = 0;
  const worker = async () => {
    while (!options.signal?.aborted) {
      const folder = eligible[nextIndex++];
      if (!folder) return;
      try {
        const result = await runTrackedAgent(folder.id, folder.name, "heartbeat", deepseekConfig, options);
        results.push(result);
      } catch (err) {
        results.push({
          folderId: folder.id,
          folderName: folder.name,
          summary: `巡检异常：${err instanceof Error ? err.message : String(err)}`,
          action: "heartbeat_exception",
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, eligible.length) }, () => worker()));

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
  return runTrackedAgent(folderId, folder.name, "manual", deepseekConfig, options);
}

// 导出 TimelineRepository 供 main 使用（写 timeline）
export { TimelineRepository };
