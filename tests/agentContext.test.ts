import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildUserMessage } from "../src/core/agent/AgentService";
import {
  discardStagedArtifact,
  prepareMaterialTask,
  stageArtifact,
  writeArtifact,
} from "../src/core/agent/materialTask";
import { countTodos, isAgentOnline } from "../src/renderer/lib/missionStats";
import type { ArtifactFormat, TaskFolder, Todo } from "../src/renderer/types";

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

test("Agent 产物格式由待办显式选择，Markdown 只是默认推荐", () => {
  const root = path.join(os.tmpdir(), `mission-artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const baseFolder: TaskFolder = {
    id: "artifact-folder",
    name: "产物格式测试",
    category: "test",
    priority: "low",
    status: "active",
    deadline: null,
    progress: 0,
    coverColor: "#000",
    createdAt: Date.now(),
    todos: [],
    materials: [],
    timeline: [],
    agentConfig: {
      enabled: true,
      strategy: "follow_up",
      permissions: { read: true, write: true, notify: false, create_subtask: false },
      lastAction: null,
    },
  };
  let markdownFile = "";
  let textFile = "";
  let jsonFile = "";
  try {
    for (const format of ["markdown", "text", "json"] as ArtifactFormat[]) {
      const todo: Todo = {
        id: `todo-${format}`,
        folderId: baseFolder.id,
        title: `生成 ${format}`,
        done: false,
        dueDate: null,
        assignee: "agent",
        subtasks: [],
        agentTaskType: "artifact",
        artifactFormat: format,
      };
      const task = prepareMaterialTask(baseFolder, todo, root);
      const generated = format === "json" ? "```json\n{\"ok\":true}\n```" : `content-${format}`;
      const file = writeArtifact(baseFolder, task, generated);
      if (format === "markdown") markdownFile = file;
      if (format === "text") textFile = file;
      if (format === "json") jsonFile = file;
      assert.equal(path.extname(file), format === "markdown" ? ".md" : format === "text" ? ".txt" : ".json");
      if (format === "json") assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { ok: true });
    }
  } finally {
    if (markdownFile && fs.existsSync(markdownFile)) fs.unlinkSync(markdownFile);
    if (textFile && fs.existsSync(textFile)) fs.unlinkSync(textFile);
    if (jsonFile && fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
    const folderDir = path.join(root, baseFolder.id);
    if (fs.existsSync(folderDir)) fs.rmdirSync(folderDir);
    if (fs.existsSync(root)) fs.rmdirSync(root);
  }
});

test("递归待办统计和 Agent 在线状态使用统一口径", () => {
  const child: Todo = {
    id: "child",
    folderId: "folder",
    title: "子任务",
    done: true,
    dueDate: null,
    assignee: "human",
    subtasks: [],
  };
  const parent: Todo = {
    ...child,
    id: "parent",
    title: "父任务",
    done: false,
    subtasks: [child],
  };
  assert.deepEqual(countTodos([parent]), { total: 2, done: 1 });

  const folder: TaskFolder = {
    id: "folder",
    name: "状态测试",
    category: "test",
    priority: "low",
    status: "active",
    deadline: null,
    progress: 50,
    coverColor: "#000",
    createdAt: 1,
    todos: [parent],
    materials: [],
    timeline: [],
    agentConfig: {
      enabled: true,
      strategy: "follow_up",
      permissions: { read: true, write: false, notify: false, create_subtask: false },
      lastAction: null,
    },
  };
  assert.equal(isAgentOnline(folder), true);
  assert.equal(isAgentOnline({ ...folder, status: "paused" }), false);
  assert.equal(isAgentOnline({ ...folder, status: "archived" }), false);
});

test("暂存产物可以在数据库写入失败时清理，不留下正式材料文件", () => {
  const root = path.join(os.tmpdir(), `mission-staged-artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const folder: TaskFolder = {
    id: "staged-folder",
    name: "暂存测试",
    category: "test",
    priority: "low",
    status: "active",
    deadline: null,
    progress: 0,
    coverColor: "#000",
    createdAt: 1,
    todos: [],
    materials: [],
    timeline: [],
    agentConfig: {
      enabled: true,
      strategy: "follow_up",
      permissions: { read: true, write: true, notify: false, create_subtask: false },
      lastAction: null,
    },
  };
  const todo: Todo = {
    id: "staged-todo",
    folderId: folder.id,
    title: "生成暂存文件",
    done: false,
    dueDate: null,
    assignee: "agent",
    subtasks: [],
    agentTaskType: "artifact",
    artifactFormat: "markdown",
  };
  const task = prepareMaterialTask(folder, todo, root);
  const staged = stageArtifact(folder, task, "暂存内容");
  try {
    assert.equal(fs.existsSync(staged.temporaryPath), true);
    assert.equal(fs.existsSync(staged.outputPath), false);
    discardStagedArtifact(staged, true);
    assert.equal(fs.existsSync(staged.temporaryPath), false);
    assert.equal(fs.existsSync(staged.outputPath), false);
  } finally {
    if (fs.existsSync(staged.temporaryPath)) fs.unlinkSync(staged.temporaryPath);
    if (fs.existsSync(staged.outputPath)) fs.unlinkSync(staged.outputPath);
    const folderDir = path.join(root, folder.id);
    if (fs.existsSync(folderDir)) fs.rmdirSync(folderDir);
    if (fs.existsSync(root)) fs.rmdirSync(root);
  }
});
