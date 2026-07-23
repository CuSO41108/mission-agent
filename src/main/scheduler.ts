// Scheduler · 心跳定时器
// 职责：按可配置分钟间隔递归调度 → 调 WorkflowService.tick → 推送事件给渲染层
// 只在 main 进程内使用，依赖 electron 的 BrowserWindow

import type { BrowserWindow } from "electron";
import {
  runFolderAgent,
  tick,
  type TickResult,
} from "../core/workflow";
import type { AgentResult } from "../core/agent";
import type { AgentRunOptions } from "../core/agent";
import type { AppConfig } from "../core/config";
import {
  DEEPSEEK_REQUEST_TIMEOUT_MS,
  HEARTBEAT_RUN_TIMEOUT_MS,
  heartbeatDelayMs,
  readHeartbeatConfig,
} from "./schedulerPolicy";

let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
let currentIntervalMin = 60;
let nextRunAt: number | null = null;
let isRunning = false;
let activeRunController: AbortController | null = null;
let runState: SchedulerRunState = "idle";
let activeRunId: string | null = null;
let activeRunStartedAt: number | null = null;
let lastRunFinishedAt: number | null = null;
let lastError: string | null = null;

type ConfigProvider = () => AppConfig;
type RuntimeOptionsProvider = () => Pick<AgentRunOptions, "artifactRoot" | "notify" | "runWorkflow">;
let runtimeOptionsProvider: RuntimeOptionsProvider = () => ({});

export function configureAgentRuntime(provider: RuntimeOptionsProvider): void {
  runtimeOptionsProvider = provider;
}
export type SchedulerRunState =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled";

export class SchedulerBusyError extends Error {
  constructor() {
    super("已有 Agent 任务正在运行，请稍后再试");
    this.name = "SchedulerBusyError";
  }
}

function beginRun(source: "scheduled" | "manual_all" | "manual_folder"): {
  runId: string;
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
  didTimeout: () => boolean;
} {
  if (isRunning) throw new SchedulerBusyError();

  const runId = `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("心跳整轮执行超时"));
  }, HEARTBEAT_RUN_TIMEOUT_MS);

  isRunning = true;
  activeRunController = controller;
  activeRunId = runId;
  activeRunStartedAt = Date.now();
  runState = "running";
  lastError = null;
  return { runId, controller, timeout, didTimeout: () => timedOut };
}

function finishRun(
  timeout: ReturnType<typeof setTimeout>,
  outcome: Exclude<SchedulerRunState, "idle" | "running">,
  error?: string,
): void {
  clearTimeout(timeout);
  runState = outcome;
  lastError = error ?? null;
  lastRunFinishedAt = Date.now();
  isRunning = false;
  activeRunController = null;
  activeRunId = null;
  activeRunStartedAt = null;
}

/**
 * 启动或重启心跳定时器
 *
 * 按用户配置的分钟间隔递归调度。回调触发时再读取最新配置，避免闭包持有旧 key/model。
 * @param getConfig 获取当前最新配置
 * @param win 用于推送事件的 BrowserWindow
 */
export function startScheduler(
  getConfig: ConfigProvider,
  win: BrowserWindow,
): void {
  stopScheduler();

  if (!readHeartbeatConfig(getConfig).enabled) {
    console.log(`[scheduler] 心跳已关闭（agent.enabled=false）`);
    return;
  }

  scheduleNext(getConfig, win);
}

function scheduleNext(getConfig: ConfigProvider, win: BrowserWindow): void {
  const snapshot = readHeartbeatConfig(getConfig);
  if (!snapshot.enabled) return;

  currentIntervalMin = snapshot.intervalMin;
  const delayMs = heartbeatDelayMs(snapshot.intervalMin);
  nextRunAt = Date.now() + delayMs;
  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    nextRunAt = null;
    void runTickOnce(getConfig, win, "scheduled")
      .catch((err) => {
        if (!(err instanceof SchedulerBusyError)) {
          console.error("[scheduler] 定时心跳触发失败：", err);
        }
      })
      .finally(() => scheduleNext(getConfig, win));
  }, delayMs);
  console.log(`[scheduler] 心跳已启动：每 ${snapshot.intervalMin} 分钟执行一次`);
}

/**
 * 停止心跳定时器
 */
export function stopScheduler(): void {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
    nextRunAt = null;
    console.log(`[scheduler] 心跳已停止`);
  }
  activeRunController?.abort(new Error("调度器已停止"));
}

/**
 * 手动触发一次心跳（不等定时器）
 * 用于：托盘"立即执行" / 设置页"立即触发" / IPC agent:triggerHeartbeat
 */
export async function runTickOnce(
  getConfig: ConfigProvider,
  win: BrowserWindow,
  source: "scheduled" | "manual_all" = "manual_all",
): Promise<TickResult> {
  const { runId, controller, timeout, didTimeout } = beginRun(source);
  const config = readHeartbeatConfig(getConfig);
  console.log(`[scheduler] 开始心跳巡检（${runId}）...`);

  // 推送开始事件
  if (!win.isDestroyed()) {
    win.webContents.send("agent:event", {
      type: "heartbeat_start",
      runId,
      source,
      timestamp: Date.now(),
    });
  }

  try {
    const result = await tick(config.deepseek, {
      ...runtimeOptionsProvider(),
      signal: controller.signal,
      requestTimeoutMs: DEEPSEEK_REQUEST_TIMEOUT_MS,
    });
    const timedOut = didTimeout();
    const cancelled = controller.signal.aborted && !timedOut;
    const outcome: Exclude<SchedulerRunState, "idle" | "running"> = timedOut
      ? "timed_out"
      : cancelled
        ? "cancelled"
        : result.failed > 0
          ? "failed"
          : "succeeded";
    console.log(
      `[scheduler] 心跳完成：扫描 ${result.scanned}，执行 ${result.executed}，` +
        `成功 ${result.succeeded}，失败 ${result.failed}，耗时 ${result.durationMs}ms`,
    );

    // 推送完成事件（含每个舱体的结果）
    if (!win.isDestroyed()) {
      win.webContents.send("agent:event", {
        type: "heartbeat_done",
        runId,
        source,
        status: outcome,
        timestamp: result.timestamp,
        scanned: result.scanned,
        executed: result.executed,
        succeeded: result.succeeded,
        failed: result.failed,
        durationMs: result.durationMs,
        results: result.results,
      });

      // 每个 failed 的舱体单独推一个 warn 通知
      for (const r of result.results.filter((r) => !r.ok)) {
        win.webContents.send("agent:event", {
          type: "agent_error",
          folderId: r.folderId,
          folderName: r.folderName,
          error: r.error,
          summary: r.summary,
          timestamp: Date.now(),
        });
      }
    }

    finishRun(
      timeout,
      outcome,
      timedOut
        ? "心跳整轮执行超时"
        : cancelled
          ? "心跳执行已取消"
          : result.failed > 0
            ? `${result.failed} 个任务舱执行失败`
            : undefined,
    );
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] 心跳异常：`, errorMsg);
    if (!win.isDestroyed()) {
      win.webContents.send("agent:event", {
        type: "heartbeat_error",
        runId,
        source,
        error: errorMsg,
        timestamp: Date.now(),
      });
    }
    finishRun(timeout, controller.signal.aborted ? "cancelled" : "failed", errorMsg);
    throw err;
  }
}

/** 手动执行单个任务舱，复用全局防重入、最新配置、状态与超时控制。 */
export async function runFolderOnce(
  getConfig: ConfigProvider,
  win: BrowserWindow,
  folderId: string,
): Promise<AgentResult> {
  const { runId, controller, timeout, didTimeout } = beginRun("manual_folder");
  const config = readHeartbeatConfig(getConfig);
  if (!win.isDestroyed()) {
    win.webContents.send("agent:event", {
      type: "agent_manual_start",
      runId,
      folderId,
      timestamp: Date.now(),
    });
  }

  try {
    const result = await runFolderAgent(folderId, config.deepseek, {
      ...runtimeOptionsProvider(),
      signal: controller.signal,
      requestTimeoutMs: DEEPSEEK_REQUEST_TIMEOUT_MS,
    });
    const timedOut = didTimeout() || result.errorCode === "MODEL_TIMEOUT";
    const cancelled = controller.signal.aborted && !didTimeout();
    const outcome = timedOut
      ? "timed_out"
      : cancelled
        ? "cancelled"
        : result.ok
          ? "succeeded"
          : "failed";
    if (!win.isDestroyed()) {
      win.webContents.send("agent:event", {
        type: "agent_manual_done",
        runId,
        folderId,
        status: outcome,
        result,
        timestamp: Date.now(),
      });
    }
    finishRun(timeout, outcome, result.error);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    finishRun(timeout, controller.signal.aborted ? "cancelled" : "failed", errorMsg);
    throw err;
  }
}

/**
 * 获取当前调度器状态
 */
export function getSchedulerStatus(): {
  scheduled: boolean;
  running: boolean;
  state: SchedulerRunState;
  intervalMin: number;
  activeRunId: string | null;
  activeRunStartedAt: number | null;
  lastRunFinishedAt: number | null;
  lastError: string | null;
  nextRunAt: number | null;
} {
  return {
    scheduled: scheduledTimer !== null,
    running: isRunning,
    state: runState,
    intervalMin: currentIntervalMin,
    activeRunId,
    activeRunStartedAt,
    lastRunFinishedAt,
    lastError,
    nextRunAt,
  };
}
