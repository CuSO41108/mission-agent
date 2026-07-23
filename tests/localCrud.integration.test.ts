import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { load as yamlLoad } from "js-yaml";
import { initConfigFile } from "../src/core/config/configLoader";
import { closeDatabase, initDatabase } from "../src/core/db/client";
import { migrateDatabase } from "../src/core/db/migrate";
import { seedDatabase } from "../src/core/db/seed";
import { getFolderDetail } from "../src/core/services/folderService";
import {
  createIntegration,
  deleteIntegration,
  getAllIntegrations,
  updateIntegration,
} from "../src/core/services/integrationService";
import { getDb } from "../src/core/db/client";
import {
  addMaterial,
  createFolder,
  createTodo,
  deleteFolder,
  deleteMaterial,
  setFolderStatus,
  toggleAgent,
  toggleTodo,
  updateAgentConfig,
  updateNoteMaterial,
} from "../src/core/services/mutationService";
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflowRuns,
  updateWorkflow,
} from "../src/core/services/workflowService";
import { dispatchWorkflowEvent, runWorkflow } from "../src/core/workflow/WorkflowEngine";
import { runAgentOnce } from "../src/core/agent/AgentService";
import { AgentRunRepository } from "../src/core/repositories/agentRunRepository";
import { tick } from "../src/core/workflow/WorkflowService";

test("Agent Run 持久化去重并以任务舱租约互斥", () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  try {
    const folder = createFolder({
      name: "运行队列测试",
      category: "test",
      priority: "medium",
      deadline: null,
      agentEnabled: true,
    });
    const first = AgentRunRepository.enqueue({ folderId: folder.id, source: "heartbeat" });
    const duplicate = AgentRunRepository.enqueue({ folderId: folder.id, source: "manual" });
    assert.equal(first.created, true);
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.run.id, first.run.id);

    const claimed = AgentRunRepository.claim(first.run.id);
    assert.equal(claimed?.status, "running");
    assert.equal(AgentRunRepository.listActive().length, 1);

    AgentRunRepository.finish(first.run.id, "succeeded", {
      summary: "完成",
      error: null,
      errorCode: null,
    });
    assert.equal(AgentRunRepository.listActive().length, 0);
    const next = AgentRunRepository.enqueue({ folderId: folder.id, source: "manual" });
    assert.equal(next.created, true);
  } finally {
    closeDatabase();
  }
});

test("心跳可在不同任务舱之间受并发上限控制地运行", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  const originalFetch = globalThis.fetch;
  let active = 0;
  let peak = 0;
  globalThis.fetch = (async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: "巡检正常" } }],
      model: "test",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    createFolder({ name: "并发任务一", category: "test", priority: "medium", deadline: null, agentEnabled: true });
    createFolder({ name: "并发任务二", category: "test", priority: "medium", deadline: null, agentEnabled: true });
    const result = await tick(
      { apiKey: "test", baseUrl: "https://example.invalid", model: "test" },
      { modelConcurrency: 2, modelCapacityKey: "integration-concurrency" },
    );
    assert.equal(result.executed, 2);
    assert.equal(result.succeeded, 2);
    assert.equal(peak, 2);
  } finally {
    globalThis.fetch = originalFetch;
    closeDatabase();
  }
});

test("预设任务舱不再写入虚假运行时间线，进度按全部待办计算", () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  try {
    seedDatabase();
    const seeded = getFolderDetail("f-001");
    assert.ok(seeded);
    const allTodos = seeded.todos.flatMap(function flatten(todo): typeof seeded.todos {
      return [todo, ...todo.subtasks.flatMap(flatten)];
    });
    const done = allTodos.filter((todo) => todo.done).length;
    assert.equal(seeded.progress, Math.round((done / Math.max(allTodos.length, 1)) * 100));
    assert.equal(seeded.timeline.length, 0);
    assert.equal(seeded.agentConfig.lastAction, null);
  } finally {
    closeDatabase();
  }
});

test("本地任务舱和材料 CRUD 保持归档/删除语义", () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();

  try {
    const folder = createFolder({
      name: "集成测试任务舱",
      category: "test",
      priority: "medium",
      deadline: null,
      agentEnabled: false,
    });
    assert.equal(folder.status, "active");
    assert.equal(folder.agentConfig.enabled, false);
    assert.equal(folder.materials.length, 0);

    const withTodo = createTodo(folder.id, {
      title: "整理测试材料",
      dueDate: null,
      assignee: "agent",
    });
    assert.equal(withTodo.todos.length, 1);
    assert.equal(withTodo.todos[0].title, "整理测试材料");
    assert.equal(withTodo.todos[0].assignee, "agent");

    const withChild = createTodo(folder.id, {
      title: "检查整理结果",
      dueDate: null,
      assignee: "human",
      parentId: withTodo.todos[0].id,
    });
    assert.equal(withChild.todos[0].subtasks.length, 1);
    assert.equal(withChild.progress, 0);

    const otherFolder = createFolder({
      name: "另一个任务舱",
      category: "test",
      priority: "low",
      deadline: null,
      agentEnabled: false,
    });
    assert.throws(
      () => toggleTodo(otherFolder.id, withTodo.todos[0].id, true),
      /不属于当前任务舱/,
    );
    assert.equal(getFolderDetail(folder.id)?.todos[0].done, false);
    const parentDone = toggleTodo(folder.id, withTodo.todos[0].id, true);
    assert.equal(parentDone.todos[0].done, true);
    assert.equal(parentDone.progress, 50);
    const markedDone = setFolderStatus(folder.id, "done");
    assert.equal(markedDone?.progress, 100);
    assert.equal(markedDone?.todos[0].subtasks[0].done, true);
    const reopened = setFolderStatus(folder.id, "active");
    assert.equal(reopened?.progress, 100);

    getDb().prepare("UPDATE todos SET done = 0 WHERE id = ?;").run(withChild.todos[0].subtasks[0].id);
    getDb().prepare("UPDATE folders SET status = 'done', progress = 50 WHERE id = ?;").run(folder.id);
    getDb().exec("DELETE FROM schema_version;");
    getDb().prepare("INSERT INTO schema_version (version, applied_at) VALUES (4, ?);").run(Date.now());
    migrateDatabase();
    assert.equal(getFolderDetail(folder.id)?.progress, 100);
    assert.equal(getFolderDetail(folder.id)?.todos[0].subtasks[0].done, true);

    const enabled = toggleAgent(folder.id, true);
    assert.equal(enabled.agentConfig.enabled, true);
    assert.throws(() => toggleAgent("missing-folder", true), /任务舱不存在/);

    const material = addMaterial(folder.id, {
      type: "file",
      name: "source.txt",
      content: "C:\\fixtures\\source.txt",
    });
    assert.equal(getFolderDetail(folder.id)?.materials[0]?.id, material.id);

    const note = addMaterial(folder.id, {
      type: "note",
      name: "任务舱笔记",
      content: "初始内容",
    });
    const updatedNote = updateNoteMaterial(folder.id, note.id, "更新后的内容");
    assert.equal(updatedNote.content, "更新后的内容");
    assert.equal(
      getFolderDetail(folder.id)?.materials.find((item) => item.id === note.id)?.content,
      "更新后的内容",
    );
    assert.throws(
      () => updateNoteMaterial(otherFolder.id, note.id, "跨舱修改"),
      /不属于当前任务舱/,
    );

    assert.throws(() => deleteFolder(folder.id), /必须先归档/);
    assert.equal(deleteMaterial(folder.id, material.id), true);
    assert.equal(deleteMaterial(folder.id, note.id), true);
    assert.equal(getFolderDetail(folder.id)?.materials.length, 0);

    setFolderStatus(folder.id, "archived");
    assert.equal(getFolderDetail(folder.id)?.status, "archived");
    assert.equal(deleteFolder(folder.id), true);
    assert.equal(getFolderDetail(folder.id), null);
  } finally {
    closeDatabase();
  }
});

test("适配器注册、配置更新和清理保持本地数据边界", () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();

  try {
    const created = createIntegration({
      name: "Internal API",
      type: "custom",
      description: "测试适配器",
      config: {
        provider: "Internal",
        account: "",
        endpoint: "https://api.example.com",
        imapHost: "",
        imapPort: null,
        smtpHost: "",
        smtpPort: null,
        webhookUrl: "",
        authType: "api_key",
      },
      secrets: { apiKey: "encrypted-value" },
    });
    assert.equal(created.config.secretConfigured.apiKey, true);
    assert.equal("secrets" in created.config, false);

    const updated = updateIntegration(created.id, {
      name: "Internal API v2",
      type: "custom",
      description: "更新后的适配器",
      config: {
        provider: created.config.provider,
        account: created.config.account,
        endpoint: "https://api.example.com/v2",
        imapHost: created.config.imapHost,
        imapPort: created.config.imapPort,
        smtpHost: created.config.smtpHost,
        smtpPort: created.config.smtpPort,
        webhookUrl: created.config.webhookUrl,
        authType: created.config.authType,
      },
      secrets: {},
    });
    assert.equal(updated.name, "Internal API v2");
    assert.equal(updated.config.secretConfigured.apiKey, true);

    const cleared = updateIntegration(created.id, {
      name: updated.name,
      type: updated.type,
      description: updated.description,
      config: {
        provider: updated.config.provider,
        account: updated.config.account,
        endpoint: updated.config.endpoint,
        imapHost: updated.config.imapHost,
        imapPort: updated.config.imapPort,
        smtpHost: updated.config.smtpHost,
        smtpPort: updated.config.smtpPort,
        webhookUrl: updated.config.webhookUrl,
        authType: updated.config.authType,
      },
      secrets: { apiKey: null },
    });
    assert.equal(cleared.config.secretConfigured.apiKey, false);

    const db = getDb();
    db.prepare(
      `INSERT INTO integrations
       (id, type, name, description, status, last_sync, events_today, config)
       VALUES ('int-email', 'email', 'Gmail 邮箱', '', 'connected', NULL, 24, NULL);`,
    ).run();
    db.exec("DELETE FROM schema_version;");
    db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (1, ?);").run(Date.now());
    migrateDatabase();
    assert.equal(getAllIntegrations().some((item) => item.id === "int-email"), false);
    assert.equal(getAllIntegrations().some((item) => item.id === created.id), true);

    assert.equal(deleteIntegration(created.id), true);
    assert.equal(getAllIntegrations().length, 0);
  } finally {
    closeDatabase();
  }
});

test("旧版接口凭据从 YAML 清理且不影响现有设置", () => {
  const configPath = path.join(os.tmpdir(), `mission-console-config-${Date.now()}.yaml`);
  fs.writeFileSync(
    configPath,
    [
      "deepseek:",
      "  apiKey: test-deepseek-key",
      "  baseUrl: https://api.deepseek.com",
      "  model: deepseek-chat",
      "agent:",
      "  heartbeatIntervalMin: 90",
      "  enabled: true",
      "integrations:",
      "  email:",
      "    imapPass: obsolete-secret",
      "  feishu:",
      "    appSecret: obsolete-secret",
      "",
    ].join("\n"),
    "utf-8",
  );

  try {
    const config = initConfigFile(configPath);
    assert.equal(config.deepseek.apiKey, "test-deepseek-key");
    assert.equal(config.agent.heartbeatIntervalMin, 90);

    const persisted = yamlLoad(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, "integrations"), false);
  } finally {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  }
});

test("工作流支持创建、条件触发、自动改状态、编辑、记录和删除", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  try {
    const folder = createFolder({
      name: "工作流目标舱",
      category: "test",
      priority: "high",
      deadline: null,
      agentEnabled: false,
    });
    const actionId = "action-set-status";
    const workflow = createWorkflow({
      name: "Agent 待办创建后暂停任务舱",
      enabled: true,
      trigger: { type: "todo_created", label: "待办创建", folderId: folder.id },
      conditions: [{ id: "condition-agent", field: "assignee", op: "eq", value: "agent" }],
      actions: [{ id: actionId, type: "set_folder_status", label: "暂停任务舱", config: { status: "paused" } }],
      layout: [
        { id: "node-trigger", kind: "trigger", refId: "trigger", x: 0, y: 0 },
        { id: "node-condition", kind: "condition", refId: "condition-agent", x: 180, y: 0 },
        { id: "node-action", kind: "action", refId: actionId, x: 360, y: 0 },
      ],
    });

    await dispatchWorkflowEvent(
      { type: "todo_created", folderId: folder.id, assignee: "human", text: "人工待办", timestamp: Date.now() },
      { chainId: "test-human", depth: 0, visitedWorkflowIds: [] },
    );
    assert.equal(getFolderDetail(folder.id)?.status, "active");

    await dispatchWorkflowEvent(
      { type: "todo_created", folderId: folder.id, assignee: "agent", text: "Agent 待办", timestamp: Date.now() },
      { chainId: "test-agent", depth: 0, visitedWorkflowIds: [] },
    );
    assert.equal(getFolderDetail(folder.id)?.status, "paused");
    assert.equal(getWorkflowRuns(workflow.id).length, 1);
    assert.equal(getWorkflowRuns(workflow.id)[0].status, "success");

    const edited = updateWorkflow(workflow.id, {
      name: "已编辑的状态工作流",
      enabled: false,
      trigger: workflow.trigger,
      conditions: workflow.conditions,
      actions: workflow.actions,
      layout: workflow.layout.map((node) => ({ ...node, x: node.x + 12 })),
    });
    assert.equal(edited.name, "已编辑的状态工作流");
    assert.equal(edited.enabled, false);
    await assert.rejects(
      () => runWorkflow(workflow.id, { type: "manual", folderId: folder.id, timestamp: Date.now() }, { chainId: "loop", depth: 1, visitedWorkflowIds: [workflow.id] }),
      /循环执行/,
    );
    assert.equal(deleteWorkflow(workflow.id), true);
    assert.equal(getWorkflowRuns(workflow.id).length, 0);
  } finally {
    closeDatabase();
  }
});

test("分析型 Agent 待办不会自动生成文件或标记完成，读取权限会阻止模型请求", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const folder = createFolder({
      name: "Agent 类型测试",
      category: "test",
      priority: "medium",
      deadline: null,
      agentEnabled: true,
    });
    const withTodo = createTodo(folder.id, {
      title: "分析现状，不生成文件",
      dueDate: null,
      assignee: "agent",
      agentTaskType: "analysis",
    });
    updateAgentConfig(folder.id, { permissions: { read: false, write: true } });
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ choices: [{ message: { content: "分析结果" } }], model: "test" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const denied = await runAgentOnce(folder.id, { apiKey: "test", baseUrl: "https://example.invalid", model: "test" });
    assert.equal(denied.errorCode, "AGENT_READ_PERMISSION_REQUIRED");
    assert.equal(fetchCalled, false);

    updateAgentConfig(folder.id, { permissions: { read: true, write: true } });
    const result = await runAgentOnce(folder.id, { apiKey: "test", baseUrl: "https://example.invalid", model: "test" });
    assert.equal(result.ok, true);
    assert.equal(result.action, "task_analyzed");
    assert.equal(result.artifactPath, undefined);
    assert.equal(getFolderDetail(folder.id)?.todos.find((todo) => todo.id === withTodo.todos[0].id)?.done, false);
    assert.equal(getFolderDetail(folder.id)?.materials.length, 0);

    const artifactFolder = createFolder({
      name: "产物目录保护测试",
      category: "test",
      priority: "low",
      deadline: null,
      agentEnabled: true,
    });
    createTodo(artifactFolder.id, {
      title: "生成产物但不提供目录",
      dueDate: null,
      assignee: "agent",
      agentTaskType: "artifact",
    });
    updateAgentConfig(artifactFolder.id, { permissions: { read: true, write: true } });
    fetchCalled = false;
    const noStorage = await runAgentOnce(artifactFolder.id, { apiKey: "test", baseUrl: "https://example.invalid", model: "test" });
    assert.equal(noStorage.errorCode, "ARTIFACT_STORAGE_NOT_CONFIGURED");
    assert.equal(fetchCalled, false);
    assert.equal(getFolderDetail(artifactFolder.id)?.materials.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    closeDatabase();
  }
});
