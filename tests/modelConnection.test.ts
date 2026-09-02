import assert from "node:assert/strict";
import test from "node:test";
import { testModelProfileConnection } from "../src/core/config/deepseekClient";
import type { ModelProfile } from "../src/core/config/defaultConfig";
import {
  ORCAROUTER_API_KEY_ENV,
  ORCAROUTER_BASE_URL,
  ORCAROUTER_DEFAULT_MODEL,
  ORCAROUTER_PROVIDER_CONFIG,
} from "../src/core/config/providerPresets";
import { findWorkflowModelProfileReferences } from "../src/core/workflow/modelProfileReferences";

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

test("OrcaRouter Provider 暴露 OpenAI 兼容接入参数", () => {
  assert.equal(ORCAROUTER_PROVIDER_CONFIG.provider, "orcarouter");
  assert.equal(ORCAROUTER_PROVIDER_CONFIG.baseUrl, "https://api.orcarouter.ai/v1");
  assert.equal(ORCAROUTER_PROVIDER_CONFIG.model, "orcarouter/auto");
  assert.equal(ORCAROUTER_PROVIDER_CONFIG.apiKeyEnv, "ORCAROUTER_API_KEY");
  assert.equal(ORCAROUTER_BASE_URL, ORCAROUTER_PROVIDER_CONFIG.baseUrl);
  assert.equal(ORCAROUTER_DEFAULT_MODEL, ORCAROUTER_PROVIDER_CONFIG.model);
  assert.equal(ORCAROUTER_API_KEY_ENV, ORCAROUTER_PROVIDER_CONFIG.apiKeyEnv);
});

test("删除模型前能同时发现旧动作和图节点中的工作流引用并去重", () => {
  const agent = { modelProfileId: profile.id, role: "", prompt: "", inputSource: "previous" as const, outputFormat: "text" as const };
  const workflows = [{
    name: "图片工作流",
    actions: [{ id: "agent-action", type: "agent" as const, label: "识图", config: { agent } }],
    graph: {
      schemaVersion: 1 as const,
      nodes: [{ id: "agent-action", type: "agent" as const, label: "识图", x: 0, y: 0, config: { agent } }],
      edges: [],
    },
  }, {
    name: "无关工作流",
    actions: [],
    graph: { schemaVersion: 1 as const, nodes: [], edges: [] },
  }];

  assert.deepEqual(findWorkflowModelProfileReferences(workflows, profile.id), ["图片工作流"]);
  assert.deepEqual(findWorkflowModelProfileReferences(workflows, "unused"), []);
});
