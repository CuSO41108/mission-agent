import type { DeepSeekConfig } from "../config/defaultConfig";
import { FolderRepository } from "../repositories/folderRepository";
import { AgentRunRepository } from "../repositories/agentRunRepository";
import { runAgentOnce, type AgentResult, type AgentRunOptions } from "./AgentService";
import type { AgentRunRecord, EnqueueAgentRunInput } from "./runTypes";

export interface AgentRunRuntime {
  config: DeepSeekConfig;
  options?: Omit<AgentRunOptions, "signal">;
}

type RuntimeProvider = () => AgentRunRuntime;
type RunExecutor = (
  folderId: string,
  config: DeepSeekConfig,
  options: AgentRunOptions,
) => Promise<AgentResult>;
type RunChanged = (run: AgentRunRecord) => void;
type Waiter = (result: AgentResult) => void;

function resultFromRecord(run: AgentRunRecord): AgentResult {
  const folderName = FolderRepository.findById(run.folderId)?.name ?? "(未知)";
  return {
    folderId: run.folderId,
    folderName,
    summary: run.summary ?? run.error ?? (run.status === "cancelled" ? "运行已取消" : "运行已结束"),
    action: run.status === "cancelled" ? "run_cancelled" : "agent_run_finished",
    ok: run.status === "succeeded",
    error: run.error ?? undefined,
    errorCode: run.errorCode ?? undefined,
    todoId: run.todoId ?? undefined,
  };
}

/**
 * 本地持久化 Agent Run Worker。
 * SQLite 是队列与资源锁的权威状态；内存仅保存执行器、取消信号和调用方 waiter。
 */
export class AgentRunQueue {
  private readonly active = new Map<string, AbortController>();
  private readonly runtimeOverrides = new Map<string, AgentRunRuntime>();
  private readonly waiters = new Map<string, Set<Waiter>>();
  private readonly cancelRequests = new Map<string, { reason: string; errorCode: string }>();
  private runtimeProvider: RuntimeProvider | null = null;
  private onChanged: RunChanged | null = null;
  private pumping = false;
  private stopped = false;

  constructor(private readonly executeRun: RunExecutor = runAgentOnce) {}

  configure(runtimeProvider: RuntimeProvider, onChanged?: RunChanged): void {
    this.runtimeProvider = runtimeProvider;
    this.onChanged = onChanged ?? null;
    this.stopped = false;
    this.pump();
  }

  start(): void {
    this.stopped = false;
    this.pump();
  }

  /** 停止认领新 Run；正在执行的 Run 会收到中止信号，重启时按 APP_INTERRUPTED 恢复。 */
  stop(): void {
    this.stopped = true;
    for (const controller of this.active.values()) {
      controller.abort(new Error("应用正在退出"));
    }
  }

  notifyRuntimeChanged(): void {
    this.pump();
  }

  enqueue(
    input: EnqueueAgentRunInput,
    runtime?: AgentRunRuntime,
  ): { run: AgentRunRecord; created: boolean } {
    const effectiveRuntime = runtime ?? this.runtimeProvider?.();
    const queued = AgentRunRepository.enqueue({
      ...input,
      model: input.model ?? effectiveRuntime?.config.model ?? null,
    });
    if (effectiveRuntime && !this.runtimeOverrides.has(queued.run.id)) {
      this.runtimeOverrides.set(queued.run.id, effectiveRuntime);
    }
    if (queued.created) this.emit(queued.run);
    this.pump();
    return queued;
  }

  enqueueAndWait(
    input: EnqueueAgentRunInput,
    runtime?: AgentRunRuntime,
    signal?: AbortSignal,
  ): Promise<AgentResult> {
    const queued = this.enqueue(input, runtime);
    const current = AgentRunRepository.getById(queued.run.id);
    if (!current || !["queued", "running"].includes(current.status)) {
      return Promise.resolve(resultFromRecord(current ?? queued.run));
    }

    return new Promise((resolve) => {
      const waiter: Waiter = (result) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(result);
      };
      const onAbort = () => {
        this.removeWaiter(queued.run.id, waiter);
        // 调用方超时或应用退出只结束本次等待，不删除已经持久化的工作。
        // 真正取消必须走 cancel()，避免 queued Run 在重启前被意外丢弃。
        resolve({
          folderId: queued.run.folderId,
          folderName: FolderRepository.findById(queued.run.folderId)?.name ?? "(未知)",
          summary: "运行已取消",
          action: "run_cancelled",
          ok: false,
          error: "运行已取消",
          errorCode: "RUN_CANCELLED",
        });
      };
      const set = this.waiters.get(queued.run.id) ?? new Set<Waiter>();
      set.add(waiter);
      this.waiters.set(queued.run.id, set);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  cancel(id: string, reason = "用户取消了运行", errorCode = "USER_CANCELLED"): boolean {
    const run = AgentRunRepository.getById(id);
    if (!run || !["queued", "running"].includes(run.status)) return false;

    if (run.status === "queued") {
      if (!AgentRunRepository.cancelQueued(id, reason, errorCode)) return false;
      this.runtimeOverrides.delete(id);
      const cancelled = AgentRunRepository.getById(id);
      if (cancelled) {
        this.emit(cancelled);
        this.settle(cancelled);
      }
      this.pump();
      return true;
    }

    const controller = this.active.get(id);
    if (!controller) return false;
    this.cancelRequests.set(id, { reason, errorCode });
    controller.abort(new Error(reason));
    return true;
  }

  retry(id: string): { run: AgentRunRecord; created: boolean } {
    const original = AgentRunRepository.getById(id);
    if (!original) throw new Error("Agent Run 不存在");
    if (["queued", "running"].includes(original.status)) {
      throw new Error("Agent Run 仍在等待或执行中，不能重试");
    }
    return this.enqueue({
      folderId: original.folderId,
      todoId: original.todoId,
      source: "manual",
      lockKey: original.lockKey,
      retryOfRunId: original.id,
    });
  }

  private maxConcurrentRuns(): number {
    const configured = this.runtimeProvider?.().options?.modelConcurrency;
    const overrides = Array.from(this.runtimeOverrides.values(), (item) => item.options?.modelConcurrency ?? 1);
    return Math.max(1, Math.min(4, configured ?? Math.max(1, ...overrides)));
  }

  private pump(): void {
    if (this.stopped || this.pumping) return;
    this.pumping = true;
    try {
      while (this.active.size < this.maxConcurrentRuns()) {
        const claimed = AgentRunRepository.claimNext();
        if (!claimed) break;
        const runtime = this.runtimeOverrides.get(claimed.id) ?? this.runtimeProvider?.();
        if (!runtime) {
          AgentRunRepository.finish(claimed.id, "failed", {
            summary: "Agent 运行时尚未配置",
            error: "Agent 运行时尚未配置",
            errorCode: "RUNTIME_NOT_CONFIGURED",
          });
          const failed = AgentRunRepository.getById(claimed.id);
          if (failed) {
            this.emit(failed);
            this.settle(failed);
          }
          continue;
        }
        const controller = new AbortController();
        this.active.set(claimed.id, controller);
        this.emit(claimed);
        void this.runClaimed(claimed, runtime, controller);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async runClaimed(
    run: AgentRunRecord,
    runtime: AgentRunRuntime,
    controller: AbortController,
  ): Promise<void> {
    try {
      const result = await this.executeRun(run.folderId, runtime.config, {
        ...runtime.options,
        signal: controller.signal,
      });
      const status = result.ok ? "succeeded" : controller.signal.aborted || result.errorCode === "RUN_CANCELLED"
        ? "cancelled"
        : "failed";
      const cancellation = this.cancelRequests.get(run.id);
      AgentRunRepository.finish(run.id, status, {
        summary: result.summary,
        error: status === "cancelled" ? cancellation?.reason ?? result.error ?? null : result.error ?? null,
        errorCode: status === "cancelled" ? cancellation?.errorCode ?? "RUN_CANCELLED" : result.errorCode ?? null,
      });
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      const cancellation = this.cancelRequests.get(run.id);
      AgentRunRepository.finish(run.id, controller.signal.aborted ? "cancelled" : "failed", {
        summary: controller.signal.aborted ? "运行已取消" : `执行异常：${detail}`,
        error: controller.signal.aborted ? cancellation?.reason ?? detail : detail,
        errorCode: controller.signal.aborted ? cancellation?.errorCode ?? "RUN_CANCELLED" : "RUN_EXCEPTION",
      });
    } finally {
      this.active.delete(run.id);
      this.cancelRequests.delete(run.id);
      this.runtimeOverrides.delete(run.id);
      const finished = AgentRunRepository.getById(run.id);
      if (finished) {
        this.emit(finished);
        this.settle(finished);
      }
      this.pump();
    }
  }

  private emit(run: AgentRunRecord): void {
    this.onChanged?.(run);
  }

  private settle(run: AgentRunRecord): void {
    const waiters = this.waiters.get(run.id);
    if (!waiters) return;
    this.waiters.delete(run.id);
    const result = resultFromRecord(run);
    for (const waiter of waiters) waiter(result);
  }

  private removeWaiter(id: string, waiter: Waiter): void {
    const waiters = this.waiters.get(id);
    if (!waiters) return;
    waiters.delete(waiter);
    if (waiters.size === 0) this.waiters.delete(id);
  }
}

export const agentRunQueue = new AgentRunQueue();
