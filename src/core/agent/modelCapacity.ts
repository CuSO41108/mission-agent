/**
 * 同一 Electron 主进程内的模型并发闸门。
 *
 * Agent Run 与 Copilot 都必须经过这里，避免两条调用路径各自认为自己
 * 没有超过模型/Key 的并发额度。它不保存 API Key，也不会向日志输出 Key。
 */
interface WaitingRequest {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface CapacityState {
  active: number;
  waiting: WaitingRequest[];
}

const capacities = new Map<string, CapacityState>();

function normalizeLimit(limit: number): number {
  return Math.max(1, Math.min(16, Math.round(limit) || 1));
}

function stateFor(key: string): CapacityState {
  const existing = capacities.get(key);
  if (existing) return existing;
  const state: CapacityState = { active: 0, waiting: [] };
  capacities.set(key, state);
  return state;
}

function removeWaiting(state: CapacityState, request: WaitingRequest): void {
  const index = state.waiting.indexOf(request);
  if (index >= 0) state.waiting.splice(index, 1);
}

function releaseSlot(key: string, limit: number): void {
  const state = stateFor(key);
  state.active = Math.max(0, state.active - 1);
  const next = state.waiting.shift();
  if (!next) return;
  if (next.signal?.aborted) {
    next.reject(new Error("模型请求已取消"));
    releaseSlot(key, limit);
    return;
  }
  state.active += 1;
  if (next.onAbort) next.signal?.removeEventListener("abort", next.onAbort);
  next.resolve(() => releaseSlot(key, limit));
}

/** 获取一个模型调用槽位；调用方必须执行返回的 release。 */
export function acquireModelSlot(
  key: string,
  limit: number,
  signal?: AbortSignal,
): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(new Error("模型请求已取消"));
  const state = stateFor(key);
  if (state.active < normalizeLimit(limit)) {
    state.active += 1;
    return Promise.resolve(() => releaseSlot(key, limit));
  }
  return new Promise<() => void>((resolve, reject) => {
    const request: WaitingRequest = { resolve, reject, signal };
    if (signal) {
      request.onAbort = () => {
        removeWaiting(state, request);
        reject(new Error("模型请求已取消"));
      };
      signal.addEventListener("abort", request.onAbort, { once: true });
    }
    state.waiting.push(request);
  });
}

export async function withModelCapacity<T>(
  key: string,
  limit: number,
  execute: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const release = await acquireModelSlot(key, limit, signal);
  try {
    return await execute();
  } finally {
    release();
  }
}

/** 用于测试隔离；产品代码不应调用。 */
export function resetModelCapacityForTests(): void {
  capacities.clear();
}
