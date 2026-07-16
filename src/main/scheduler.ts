// Scheduler · 心跳定时器
// 职责：node-cron 注册定时器 → 调 WorkflowService.tick → 推送事件给渲染层
// 只在 main 进程内使用，依赖 electron 的 BrowserWindow

import cron, { type ScheduledTask } from "node-cron";
import type { BrowserWindow } from "electron";
import { tick, type TickResult } from "../core/workflow";
import type { AppConfig } from "../core/config";

let scheduledTask: ScheduledTask | null = null;
let currentInterval = 0;
let isRunning = false;

/**
 * 启动或重启心跳定时器
 *
 * @param intervalMin 间隔分钟（5-120）
 * @param enabled 全局开关
 * @param config DeepSeek 配置（传给 WorkflowService.tick）
 * @param win 用于推送事件的 BrowserWindow
 */
export function startScheduler(
  intervalMin: number,
  enabled: boolean,
  config: AppConfig,
  win: BrowserWindow,
): void {
  // 先停掉旧的
  stopScheduler();

  if (!enabled) {
    console.log(`[scheduler] 心跳已关闭（agent.enabled=false）`);
    return;
  }

  // 防御：间隔至少 5 分钟
  const interval = Math.max(5, Math.min(120, intervalMin));
  const cronExpr = `*/${interval} * * * *`;

  scheduledTask = cron.schedule(cronExpr, () => {
    void runTickOnce(config, win);
  });
  currentInterval = interval;
  console.log(`[scheduler] 心跳已启动：每 ${interval} 分钟一次（cron: ${cronExpr}）`);
}

/**
 * 停止心跳定时器
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log(`[scheduler] 心跳已停止`);
  }
  currentInterval = 0;
}

/**
 * 手动触发一次心跳（不等定时器）
 * 用于：托盘"立即执行" / 设置页"立即触发" / IPC agent:triggerHeartbeat
 */
export async function runTickOnce(
  config: AppConfig,
  win: BrowserWindow,
): Promise<TickResult> {
  // 防重入：上一次还没跑完就跳过
  if (isRunning) {
    console.log(`[scheduler] 上一次心跳未完成，跳过本次触发`);
    return {
      timestamp: Date.now(),
      scanned: 0,
      executed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      durationMs: 0,
    };
  }

  isRunning = true;
  console.log(`[scheduler] 开始心跳巡检...`);

  // 推送开始事件
  if (!win.isDestroyed()) {
    win.webContents.send("agent:event", {
      type: "heartbeat_start",
      timestamp: Date.now(),
    });
  }

  try {
    const result = await tick(config.deepseek);
    console.log(
      `[scheduler] 心跳完成：扫描 ${result.scanned}，执行 ${result.executed}，` +
        `成功 ${result.succeeded}，失败 ${result.failed}，耗时 ${result.durationMs}ms`,
    );

    // 推送完成事件（含每个舱体的结果）
    if (!win.isDestroyed()) {
      win.webContents.send("agent:event", {
        type: "heartbeat_done",
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

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] 心跳异常：`, errorMsg);
    if (!win.isDestroyed()) {
      win.webContents.send("agent:event", {
        type: "heartbeat_error",
        error: errorMsg,
        timestamp: Date.now(),
      });
    }
    throw err;
  } finally {
    isRunning = false;
  }
}

/**
 * 获取当前调度器状态
 */
export function getSchedulerStatus(): {
  running: boolean;
  intervalMin: number;
} {
  return {
    running: scheduledTask !== null,
    intervalMin: currentInterval,
  };
}
