import assert from "node:assert/strict";
import test from "node:test";
import { parseCopilotDraft } from "../src/core/copilot/copilotService";

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
