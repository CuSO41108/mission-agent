import assert from "node:assert/strict";
import test from "node:test";
import { buildUserMessage } from "../src/core/agent/AgentService";
import type { TaskFolder } from "../src/renderer/types";

test("Agent prompt 包含任务舱的真实待办和材料", () => {
  const folder: TaskFolder = {
    id: "folder-1",
    name: "博客整理",
    category: "content",
    priority: "medium",
    status: "active",
    deadline: null,
    progress: 0,
    coverColor: "#00E5D4",
    createdAt: 1,
    todos: [
      {
        id: "todo-1",
        folderId: "folder-1",
        title: "把 JSON 和图片整理成 Markdown",
        done: false,
        dueDate: null,
        assignee: "agent",
        subtasks: [],
      },
    ],
    materials: [
      {
        id: "material-1",
        folderId: "folder-1",
        type: "doc",
        name: "source.json",
        content: "C:\\fixtures\\source.json",
        addedAt: 1,
      },
    ],
    timeline: [],
    agentConfig: {
      enabled: true,
      strategy: "follow_up",
      permissions: { read: true, write: false, notify: false, create_subtask: false },
      lastAction: null,
    },
  };

  const prompt = buildUserMessage(folder);
  assert.match(prompt, /把 JSON 和图片整理成 Markdown/);
  assert.match(prompt, /doc: source\.json/);
});
