// Workflow Service · 心跳调度主逻辑
// 职责：扫描所有 enabled 舱体 → 调 AgentService → 收集结果
// 零 electron 依赖，由 main/scheduler.ts 调用，结果通过回调推送给 UI

import { FolderRepository } from "../repositories/folderRepository";
import { AgentConfigRepository } from "../repositories/agentConfigRepository";
import { TimelineRepository } from "../repositories/timelineRepository";
import {
  runAgentOnce,
  type AgentResult,
  type AgentRunOptions,
} from "../agent";
import { getManualRunDenial, isHeartbeatEligible } from "./agentRunPolicy";

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
 * 3. enabled 的 folder 调 runAgentOnce（串行，避免模型服务限流）
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
  const results: AgentResult[] = [];

  for (const folder of folders) {
    if (options.signal?.aborted) break;
    const agentCfg = AgentConfigRepository.findByFolder(folder.id);
    if (!isHeartbeatEligible(folder, agentCfg)) {
      continue;
    }
    try {
      const result = await runAgentOnce(folder.id, deepseekConfig, options);
      results.push(result);
    } catch (err) {
      // 单个舱体出错不应中断整个心跳
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
  return runAgentOnce(folderId, deepseekConfig, options);
}

// 导出 TimelineRepository 供 main 使用（写 timeline）
export { TimelineRepository };
