import assert from "node:assert/strict";
import test from "node:test";
import { testModelProfileConnection } from "../src/core/config/deepseekClient";
import type { ModelProfile } from "../src/core/config/defaultConfig";

const profile: ModelProfile = {
  id: "multimodal-test",
  name: "任意多模态模型",
  provider: "openai_compatible",
  apiKey: "test-key",
  baseUrl: "https://example.invalid/v1",
  model: "vision-model",
  capabilities: ["text", "image"],
};

test("模型配置连接测试会在指定时间内中止", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  })) as typeof fetch;
  try {
    await assert.rejects(() => testModelProfileConnection(profile, 10), /模型请求超时（10ms）/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("模型配置连接测试在请求前校验通用配置", async () => {
  await assert.rejects(() => testModelProfileConnection({ ...profile, model: "" }), /模型 ID 为空/);
  await assert.rejects(() => testModelProfileConnection({ ...profile, baseUrl: "" }), /Base URL 为空/);
});
