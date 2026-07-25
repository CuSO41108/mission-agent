import assert from "node:assert/strict";
import test from "node:test";
import { draftWithCopilot, parseCopilotDraft } from "../src/core/copilot/copilotService";

const TEST_CONFIG = {
  apiKey: "test-only",
  baseUrl: "https://example.invalid",
  model: "test-model",
};

function modelResponse(content: string): Response {
  return new Response(JSON.stringify({
    model: "test-model",
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("Copilot 任务舱草稿只生成待确认的本地输入", () => {
  const draft = parseCopilotDraft(JSON.stringify({
    kind: "folder",
    summary: "为下周演示准备任务舱。",
    name: "客户演示准备",
    category: "客户项目",
    priority: "high",
    deadline: "2026-07-31",
    todos: [
      { title: "整理演示大纲", assignee: "human" },
      { title: "检查材料完整性", assignee: "agent" },
    ],
  }));
  assert.equal(draft.kind, "folder");
  if (draft.kind !== "folder") return;
  assert.equal(draft.input.agentEnabled, false);
  assert.equal(draft.todos.length, 2);
});

test("Copilot 工作流草稿拒绝运行 Agent 等越界动作", () => {
  assert.throws(
    () => parseCopilotDraft(JSON.stringify({
      kind: "workflow",
      summary: "越界草稿",
      name: "自动执行 Agent",
      actions: [{ type: "run_agent", label: "运行 Agent" }],
    })),
    /不在允许范围内/,
  );
});

test("Copilot 可生成停用的多模型单链路工作流草稿", () => {
  const draft = parseCopilotDraft(JSON.stringify({
    kind: "workflow",
    summary: "先识图，再写文案，最后保存 Markdown。",
    name: "小红书图片文案",
    actions: [
      {
        type: "agent",
        label: "Qwen 识图",
        modelProfileId: "qwen-vl",
        role: "你是图片信息提取助手。",
        prompt: "提取 OCR、画面概述、事实和不确定内容。",
        inputSource: "folder_images",
        outputFormat: "json",
        outputSchema: { type: "object" },
      },
      {
        type: "agent",
        label: "DeepSeek 文案策划",
        modelProfileId: "deepseek-default",
        role: "你是小红书文案策划。",
        prompt: "根据上一节点 JSON 生成文案。",
        inputSource: "previous",
        outputFormat: "markdown",
      },
      { type: "save_artifact", label: "保存文案", artifactName: "小红书文案", format: "markdown" },
    ],
  }));
  assert.equal(draft.kind, "workflow");
  if (draft.kind !== "workflow") return;
  assert.equal(draft.input.enabled, false);
  assert.deepEqual(draft.input.actions.map((action) => action.type), ["agent", "agent", "save_artifact"]);
  assert.equal(draft.input.actions[0].config.agent?.outputFormat, "json");
  assert.equal(draft.input.actions[1].config.agent?.modelProfileId, "deepseek-default");
  assert.equal(draft.input.actions[2].config.artifactFormat, "markdown");
});

test("Copilot 草稿请求启用 JSON 输出并为多 Agent 草稿保留足够长度", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return modelResponse(JSON.stringify({
      kind: "workflow",
      summary: "先识图，再写文案，最后保存。",
      name: "图片文案工作流",
      actions: [
        {
          type: "agent",
          label: "识图",
          modelProfileId: "qwen-vl",
          role: "图片信息提取助手",
          prompt: "提取 OCR、画面、事实和不确定内容。",
          inputSource: "folder_images",
          outputFormat: "json",
          outputSchema: { type: "object" },
        },
        {
          type: "agent",
          label: "文案",
          modelProfileId: "deepseek-default",
          role: "小红书文案策划",
          prompt: "根据上一节点 JSON 写标题、正文和标签。",
          inputSource: "previous",
          outputFormat: "markdown",
        },
        { type: "save_artifact", label: "保存", artifactName: "小红书文案", format: "markdown" },
      ],
    }));
  }) as typeof fetch;

  try {
    const result = await draftWithCopilot(TEST_CONFIG, [], "创建图片识别和文案工作流");
    assert.equal(result.draft?.kind, "workflow");
    assert.deepEqual(requestBody?.response_format, { type: "json_object" });
    assert.equal(requestBody?.max_tokens, 2400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Copilot 会对无法解析的首次回复进行一次受控修复", async () => {
  const originalFetch = globalThis.fetch;
  const replies = [
    "我来为你设计这个工作流。",
    JSON.stringify({
      kind: "folder",
      summary: "已修复为合法草稿。",
      name: "修复后的草稿",
      category: "测试",
      priority: "medium",
      deadline: "",
      todos: [],
    }),
  ];
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return modelResponse(replies.shift() ?? "");
  }) as typeof fetch;

  try {
    const result = await draftWithCopilot(TEST_CONFIG, [], "创建一个测试草稿");
    assert.equal(result.draft?.kind, "folder");
    assert.equal(requestBodies.length, 2);
    const repairMessages = requestBodies[1].messages as Array<{ role: string; content: string }>;
    assert.equal(repairMessages.at(-2)?.role, "assistant");
    assert.match(repairMessages.at(-1)?.content ?? "", /修复并重新输出完整/);
    assert.deepEqual(result.usage, { promptTokens: 20, completionTokens: 40, totalTokens: 60 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Copilot 二次解析失败时提供脱敏且有界的响应片段", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return modelResponse(callCount === 1
      ? "第一次没有 JSON"
      : "仍然失败 C:\\Users\\someone\\secret.txt sk-secretvalue123456789");
  }) as typeof fetch;

  try {
    await assert.rejects(
      draftWithCopilot(TEST_CONFIG, [], "创建一个测试草稿"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /返回片段：仍然失败/);
        assert.doesNotMatch(error.message, /C:\\Users/);
        assert.doesNotMatch(error.message, /secretvalue/);
        return true;
      },
    );
    assert.equal(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
