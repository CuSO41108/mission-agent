import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
  DEFAULT_MAX_CONCURRENT_AGENT_RUNS,
  DEFAULT_CONFIG,
  mergeConfig,
  type AppConfig,
} from "../src/core/config/defaultConfig.ts";
import { chat } from "../src/core/config/deepseekClient.ts";
import {
  getManualRunDenial,
  isHeartbeatEligible,
} from "../src/core/workflow/agentRunPolicy.ts";
import {
  heartbeatDelayMs,
  readHeartbeatConfig,
} from "../src/main/schedulerPolicy.ts";

test("心跳默认 60 分钟，同时保留用户可配置间隔", () => {
  assert.equal(DEFAULT_HEARTBEAT_INTERVAL_MINUTES, 60);
  assert.equal(DEFAULT_CONFIG.agent.heartbeatIntervalMin, 60);
  assert.equal(
    mergeConfig(DEFAULT_CONFIG, {
      agent: {
        enabled: true,
        heartbeatIntervalMin: 120,
        maxConcurrentRuns: DEFAULT_MAX_CONCURRENT_AGENT_RUNS,
      },
    }).agent.heartbeatIntervalMin,
    120,
  );
  assert.equal(heartbeatDelayMs(90), 90 * 60 * 1000);
  assert.equal(heartbeatDelayMs(1), 5 * 60 * 1000);
  assert.equal(heartbeatDelayMs(9999), 24 * 60 * 60 * 1000);
});

test("每次心跳读取最新 DeepSeek 配置，同时保持本轮快照稳定", () => {
  let config: AppConfig = {
    ...DEFAULT_CONFIG,
    deepseek: { ...DEFAULT_CONFIG.deepseek, apiKey: "first-key" },
  };
  const getConfig = () => config;

  const first = readHeartbeatConfig(getConfig);
  config = {
    ...config,
    deepseek: { ...config.deepseek, apiKey: "second-key" },
  };
  const second = readHeartbeatConfig(getConfig);

  assert.equal(first.deepseek.apiKey, "first-key");
  assert.equal(second.deepseek.apiKey, "second-key");
});

test("自动心跳只执行 active 且 Agent enabled 的任务舱", () => {
  assert.equal(isHeartbeatEligible({ status: "active" }, { enabled: true }), true);
  assert.equal(isHeartbeatEligible({ status: "active" }, { enabled: false }), false);
  assert.equal(isHeartbeatEligible({ status: "paused" }, { enabled: true }), false);
  assert.equal(isHeartbeatEligible({ status: "done" }, { enabled: true }), false);
  assert.equal(isHeartbeatEligible({ status: "archived" }, { enabled: true }), false);
});

test("手动执行同样拒绝非 active 或 disabled 的任务舱", () => {
  assert.equal(getManualRunDenial({ status: "active" }, { enabled: true }), null);
  assert.equal(
    getManualRunDenial({ status: "paused" }, { enabled: true })?.code,
    "FOLDER_INACTIVE",
  );
  assert.equal(
    getManualRunDenial({ status: "active" }, { enabled: false })?.code,
    "AGENT_DISABLED",
  );
  assert.equal(getManualRunDenial(null, null)?.code, "FOLDER_NOT_FOUND");
});

test("DeepSeek 请求超时会中止底层 fetch", async () => {
  const originalFetch = globalThis.fetch;
  let observedSignal: AbortSignal | undefined;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    observedSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      observedSignal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      chat(
        { apiKey: "test-only", baseUrl: "https://example.invalid", model: "test" },
        [{ role: "user", content: "ping" }],
        { timeoutMs: 10 },
      ),
      /请求超时/,
    );
    assert.equal(observedSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
