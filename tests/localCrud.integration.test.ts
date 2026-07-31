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
import { inspectMaterialAvailability } from "../src/core/services/materialAvailability";
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
  updateTodoAssignment,
  updateAgentConfig,
  updateNoteMaterial,
  updateTodo,
  renameNoteMaterial,
} from "../src/core/services/mutationService";
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflowRuns,
  updateWorkflow,
} from "../src/core/services/workflowService";
import { dispatchWorkflowEvent, registerWorkflowRuntime, resumeWorkflowRun, runWorkflow } from "../src/core/workflow/WorkflowEngine";
import { runAgentOnce } from "../src/core/agent/AgentService";
import { AgentRunRepository } from "../src/core/repositories/agentRunRepository";
import { tick } from "../src/core/workflow/WorkflowService";
import { AgentRunQueue } from "../src/core/agent/AgentRunQueue";
import { WorkflowStepRunRepository } from "../src/core/repositories/workflowRepository";
import { IntegrationRepository } from "../src/core/repositories/integrationRepository";
import {
  listFeishuTargets,
  renderIntegrationTemplate,
  sendFeishuText,
  testFeishuConnection,
} from "../src/core/integrations/feishuConnector";

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("等待条件超时");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

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

test("同舱资源冲突的 Run 保持排队，并在资源释放后自动执行", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  let releaseFirst: (() => void) | null = null;
  const started: string[] = [];
  const queue = new AgentRunQueue(async (folderId) => {
    started.push(folderId);
    if (started.length === 1) {
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
    }
    return { folderId, folderName: "队列测试", summary: "完成", action: "test", ok: true };
  });
  try {
    const folder = createFolder({ name: "同舱队列", category: "test", priority: "medium", deadline: null, agentEnabled: true });
    const firstTodo = createTodo(folder.id, { title: "任务一", dueDate: null, assignee: "agent" }).todos[0];
    const secondTodo = createTodo(folder.id, { title: "任务二", dueDate: null, assignee: "agent" }).todos[1];
    queue.configure(() => ({
      config: { apiKey: "test", baseUrl: "https://example.invalid", model: "test" },
      options: { modelConcurrency: 2 },
    }));

    const first = queue.enqueue({ folderId: folder.id, todoId: firstTodo.id, source: "manual" });
    const second = queue.enqueue({ folderId: folder.id, todoId: secondTodo.id, source: "manual" });
    await waitUntil(() => AgentRunRepository.getById(first.run.id)?.status === "running");
    assert.equal(AgentRunRepository.getById(second.run.id)?.status, "queued");

    assert.ok(releaseFirst);
    releaseFirst();
    await waitUntil(() => AgentRunRepository.getById(second.run.id)?.status === "succeeded");
    assert.equal(started.length, 2);
  } finally {
    queue.stop();
    closeDatabase();
  }
});

test("应用重启后 queued Run 自动恢复，遗留 running Run 不重放", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  const queue = new AgentRunQueue(async (folderId) => ({
    folderId,
    folderName: "恢复测试",
    summary: "恢复完成",
    action: "test",
    ok: true,
  }));
  try {
    const queuedFolder = createFolder({ name: "排队恢复", category: "test", priority: "medium", deadline: null, agentEnabled: true });
    const interruptedFolder = createFolder({ name: "中断保护", category: "test", priority: "medium", deadline: null, agentEnabled: true });
    const queued = AgentRunRepository.enqueue({ folderId: queuedFolder.id, source: "heartbeat" });
    const interrupted = AgentRunRepository.enqueue({ folderId: interruptedFolder.id, source: "manual" });
    assert.equal(AgentRunRepository.claim(interrupted.run.id)?.status, "running");
    assert.equal(AgentRunRepository.recoverInterruptedRuns(), 1);
    assert.equal(AgentRunRepository.getById(interrupted.run.id)?.errorCode, "APP_INTERRUPTED");

    queue.configure(() => ({
      config: { apiKey: "test", baseUrl: "https://example.invalid", model: "test" },
      options: { modelConcurrency: 2 },
    }));
    await waitUntil(() => AgentRunRepository.getById(queued.run.id)?.status === "succeeded");
    assert.equal(AgentRunRepository.getById(interrupted.run.id)?.status, "cancelled");
  } finally {
    queue.stop();
    closeDatabase();
  }
});

test("运行中的 Run 可安全取消，重试创建带关联的新 Run", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  let attempts = 0;
  const queue = new AgentRunQueue(async (folderId, _config, options) => {
    attempts += 1;
    if (attempts === 1) {
      await new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve(), { once: true }));
      return { folderId, folderName: "取消测试", summary: "已取消", action: "test", ok: false, error: "已取消", errorCode: "RUN_CANCELLED" };
    }
    return { folderId, folderName: "取消测试", summary: "重试成功", action: "test", ok: true };
  });
  try {
    const folder = createFolder({ name: "取消与重试", category: "test", priority: "medium", deadline: null, agentEnabled: true });
    queue.configure(() => ({
      config: { apiKey: "test", baseUrl: "https://example.invalid", model: "test" },
      options: { modelConcurrency: 1 },
    }));
    const first = queue.enqueue({ folderId: folder.id, source: "manual" });
    await waitUntil(() => AgentRunRepository.getById(first.run.id)?.status === "running");
    assert.equal(queue.cancel(first.run.id), true);
    await waitUntil(() => AgentRunRepository.getById(first.run.id)?.status === "cancelled");
    assert.equal(AgentRunRepository.getById(first.run.id)?.errorCode, "USER_CANCELLED");

    const retried = queue.retry(first.run.id);
    assert.equal(retried.created, true);
    assert.equal(retried.run.retryOfRunId, first.run.id);
    await waitUntil(() => AgentRunRepository.getById(retried.run.id)?.status === "succeeded");
  } finally {
    queue.stop();
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
    const renamedNote = renameNoteMaterial(folder.id, note.id, "  项目调研笔记  ");
    assert.equal(renamedNote.name, "项目调研笔记");
    assert.equal(
      getFolderDetail(folder.id)?.materials.find((item) => item.id === note.id)?.name,
      "项目调研笔记",
    );
    assert.throws(() => renameNoteMaterial(folder.id, note.id, "   "), /名称不能为空/);
    assert.throws(
      () => renameNoteMaterial(otherFolder.id, note.id, "跨舱重命名"),
      /不属于当前任务舱/,
    );
    assert.throws(() => renameNoteMaterial(folder.id, material.id, "文件重命名"), /笔记不存在/);

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

test("Agent 托管关闭时可修改未完成任务并校验状态边界", () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();

  try {
    const folder = createFolder({
      name: "任务编辑测试舱",
      category: "test",
      priority: "medium",
      deadline: null,
      agentEnabled: false,
    });
    const otherFolder = createFolder({
      name: "其他任务舱",
      category: "test",
      priority: "low",
      deadline: null,
      agentEnabled: false,
    });
    const created = createTodo(folder.id, {
      title: "原始任务",
      dueDate: null,
      assignee: "human",
    });
    const todoId = created.todos[0].id;
    const dueDate = Date.now() + 86_400_000;

    const updated = updateTodo(folder.id, todoId, {
      title: "  生成项目复盘  ",
      dueDate,
      assignee: "agent",
      agentTaskType: "artifact",
      artifactFormat: "json",
      workflowId: "should-be-cleared",
    });
    assert.equal(updated.todos[0].title, "生成项目复盘");
    assert.equal(updated.todos[0].dueDate, dueDate);
    assert.equal(updated.todos[0].assignee, "agent");
    assert.equal(updated.todos[0].agentTaskType, "artifact");
    assert.equal(updated.todos[0].artifactFormat, "json");
    assert.equal(updated.todos[0].workflowId, null);
    assert.throws(
      () => updateTodo(otherFolder.id, todoId, {
        title: "跨舱修改",
        dueDate: null,
        assignee: "human",
      }),
      /不属于当前任务舱/,
    );
    assert.throws(
      () => updateTodo(folder.id, todoId, { title: "  ", dueDate: null, assignee: "human" }),
      /标题不能为空/,
    );

    toggleTodo(folder.id, todoId, true);
    assert.throws(
      () => updateTodo(folder.id, todoId, { title: "修改已完成任务", dueDate: null, assignee: "human" }),
      /已完成待办不能修改/,
    );

    const pending = createTodo(folder.id, {
      title: "等待 Agent 的任务",
      dueDate: null,
      assignee: "agent",
    }).todos.find((todo) => !todo.done);
    assert.ok(pending);
    toggleAgent(folder.id, true);
    assert.throws(
      () => updateTodo(folder.id, pending.id, { title: "托管中修改", dueDate: null, assignee: "agent" }),
      /托管已开启/,
    );

    toggleAgent(folder.id, false);
    setFolderStatus(folder.id, "archived");
    assert.throws(
      () => updateTodo(folder.id, pending.id, { title: "归档后修改", dueDate: null, assignee: "agent" }),
      /已归档任务舱不能修改待办/,
    );
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
        mode: "legacy",
        targets: [],
      },
      secrets: { apiKey: "encrypted-value" },
    });
    assert.equal(created.config.secretConfigured.apiKey, true);
    assert.equal("secrets" in created.config, false);
    const storedAfterCreate = String((getDb().prepare("SELECT config FROM integrations WHERE id = ?").get(created.id) as { config: string }).config);
    assert.doesNotMatch(storedAfterCreate, /encrypted-value/);

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
        mode: created.config.mode,
        targets: created.config.targets,
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
        mode: updated.config.mode,
        targets: updated.config.targets,
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

test("工作流使用同一 runId 从 Agent 节点 Checkpoint 断点续跑", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  let attempts = 0;
  const dispose = registerWorkflowRuntime({
    runAgent: async () => ({ ok: true, summary: "legacy" }),
    runAgentNode: async ({ input }) => {
      attempts += 1;
      if (attempts === 1) return { ok: false, error: "模拟可恢复的模型错误" };
      return { ok: true, summary: "恢复成功", output: { version: 1, data: { recovered: true, input: input.data } } };
    },
    notify: () => undefined,
    changed: () => undefined,
  });
  try {
    const folder = createFolder({ name: "Checkpoint 测试", category: "test", priority: "medium", deadline: null, agentEnabled: false });
    const actionId = "agent-vision";
    const workflow = createWorkflow({
      name: "可恢复工作流",
      enabled: false,
      trigger: { type: "manual", label: "手动执行", folderId: folder.id },
      conditions: [],
      actions: [{
        id: actionId,
        type: "agent",
        label: "识图 Agent",
        config: {
          agent: {
            modelProfileId: "test-model",
            role: "测试角色",
            prompt: "测试任务",
            inputSource: "previous",
            outputFormat: "json",
          },
        },
      }],
      layout: [
        { id: "node-trigger", kind: "trigger", refId: "trigger", x: 0, y: 0 },
        { id: "node-agent", kind: "action", refId: actionId, x: 180, y: 0 },
      ],
    });
    const failed = await runWorkflow(workflow.id, { type: "manual", folderId: folder.id, timestamp: Date.now() });
    assert.equal(failed.status, "failed");
    assert.equal(WorkflowStepRunRepository.find(failed.id, actionId)?.attempts, 1);

    const resumed = await resumeWorkflowRun(failed.id);
    assert.equal(resumed.id, failed.id);
    assert.equal(resumed.status, "success");
    assert.equal(WorkflowStepRunRepository.find(failed.id, actionId)?.attempts, 2);
    assert.equal(WorkflowStepRunRepository.find(failed.id, actionId)?.output?.data && (WorkflowStepRunRepository.find(failed.id, actionId)!.output!.data as { recovered: boolean }).recovered, true);
    assert.equal(getWorkflowRuns(workflow.id).length, 1);
  } finally {
    dispose();
    closeDatabase();
  }
});

test("纯 Prompt Agent 工作流无需绑定任务舱即可运行", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  let receivedFolderId: string | null | undefined;
  const dispose = registerWorkflowRuntime({
    runAgent: async () => ({ ok: true, summary: "legacy" }),
    runAgentNode: async ({ folderId, input }) => {
      receivedFolderId = folderId;
      return { ok: true, summary: "纯 Prompt 完成", output: { version: 1, data: { promptOnly: true, input: input.data } } };
    },
    notify: () => undefined,
    changed: () => undefined,
  });
  try {
    const actionId = "prompt-only-agent";
    const workflow = createWorkflow({
      name: "无任务舱 Prompt 工作流",
      enabled: false,
      trigger: { type: "manual", label: "手动执行", folderId: null },
      conditions: [],
      actions: [{
        id: actionId,
        type: "agent",
        label: "纯 Prompt 节点",
        config: { agent: { modelProfileId: "test-model", role: "测试角色", prompt: "只运行提示词", inputSource: "previous", outputFormat: "json" } },
      }],
      layout: [
        { id: "node-trigger", kind: "trigger", refId: "trigger", x: 0, y: 0 },
        { id: "node-agent", kind: "action", refId: actionId, x: 180, y: 0 },
      ],
    });

    const run = await runWorkflow(workflow.id, { type: "manual", folderId: null, timestamp: Date.now() });
    assert.equal(run.status, "success");
    assert.equal(receivedFolderId, null);
    assert.equal(WorkflowStepRunRepository.find(run.id, actionId)?.output?.data && (WorkflowStepRunRepository.find(run.id, actionId)!.output!.data as { promptOnly: boolean }).promptOnly, true);
  } finally {
    dispose();
    closeDatabase();
  }
});

test("飞书群机器人凭据不落库，并仅向适配器授权目标发送文本", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedBody = "";
  try {
    const integration = createIntegration({
      name: "研发通知群",
      type: "chat",
      description: "测试飞书发送",
      config: {
        provider: "Feishu",
        account: "",
        endpoint: "https://open.feishu.cn",
        imapHost: "",
        imapPort: null,
        smtpHost: "",
        smtpPort: null,
        webhookUrl: "",
        authType: "webhook",
        mode: "feishu_webhook",
        targets: [{ id: "webhook", name: "研发通知群", kind: "webhook" }],
      },
      secrets: {
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/test-secret",
        token: "signing-secret",
      },
    });
    const stored = String((getDb().prepare("SELECT config FROM integrations WHERE id = ?").get(integration.id) as { config: string }).config);
    assert.doesNotMatch(stored, /test-secret|signing-secret/);
    IntegrationRepository.updateStatus(integration.id, "connected");
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(url);
      requestedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ code: 0, msg: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await sendFeishuText({
      integrationId: integration.id,
      targetId: "webhook",
      text: "任务完成",
      idempotencyKey: "run-1-step-1",
    });
    assert.match(requestedUrl, /test-secret/);
    assert.deepEqual((JSON.parse(requestedBody) as { content: { text: string } }).content, { text: "任务完成" });
    assert.equal(IntegrationRepository.findById(integration.id)?.eventsToday, 1);
    await assert.rejects(
      sendFeishuText({ integrationId: integration.id, targetId: "not-authorized", text: "不应发送", idempotencyKey: "x" }),
      /未在适配器授权列表/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    closeDatabase();
  }
});

test("飞书连接测试只在真实发送成功后标记已验证，并识别 Webhook 业务错误", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const integration = createIntegration({
      name: "测试通知群",
      type: "chat",
      description: "测试连接状态",
      config: {
        provider: "Feishu",
        account: "",
        endpoint: "https://open.feishu.cn",
        imapHost: "",
        imapPort: null,
        smtpHost: "",
        smtpPort: null,
        webhookUrl: "",
        authType: "webhook",
        mode: "feishu_webhook",
        targets: [{ id: "webhook", name: "测试通知群", kind: "webhook" }],
      },
      secrets: { webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/connection-test" },
    });
    assert.equal(integration.status, "disconnected");

    globalThis.fetch = (async () => new Response(JSON.stringify({
      StatusCode: 19002,
      StatusMessage: "sign match fail or timestamp is not within one hour from current time",
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    await assert.rejects(testFeishuConnection(integration.id, "webhook"), /19002.*sign match fail/);
    assert.equal(IntegrationRepository.findById(integration.id)?.status, "error");
    assert.equal(IntegrationRepository.findById(integration.id)?.eventsToday, 0);

    globalThis.fetch = (async () => new Response(JSON.stringify({ StatusCode: 0, StatusMessage: "success" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    await testFeishuConnection(integration.id, "webhook");
    assert.equal(IntegrationRepository.findById(integration.id)?.status, "connected");
    assert.equal(IntegrationRepository.findById(integration.id)?.eventsToday, 1);

    assert.throws(() => createIntegration({
      name: "错误地址",
      type: "chat",
      description: "不允许伪装成飞书的任意地址",
      config: {
        provider: "Feishu",
        account: "",
        endpoint: "https://open.feishu.cn",
        imapHost: "",
        imapPort: null,
        smtpHost: "",
        smtpPort: null,
        webhookUrl: "",
        authType: "webhook",
        mode: "feishu_webhook",
        targets: [{ id: "webhook", name: "错误地址", kind: "webhook" }],
      },
      secrets: { webhookUrl: "https://example.com/collect" },
    }), /必须是 open\.feishu\.cn/);
  } finally {
    globalThis.fetch = originalFetch;
    closeDatabase();
  }
});

test("飞书自建应用使用机器人身份列出群，消息模板只解析受限变量", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  try {
    const integration = createIntegration({
      name: "企业机器人",
      type: "chat",
      description: "读取机器人所在群",
      config: {
        provider: "Feishu",
        account: "",
        endpoint: "https://open.feishu.cn",
        imapHost: "",
        imapPort: null,
        smtpHost: "",
        smtpPort: null,
        webhookUrl: "",
        authType: "oauth2",
        mode: "feishu_app",
        targets: [],
      },
      secrets: { clientId: "app-id", clientSecret: "app-secret" },
    });
    globalThis.fetch = (async (url: string | URL | Request) => {
      requests.push(String(url));
      if (requests.length === 1) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "tenant-token" }), { status: 200 });
      }
      return new Response(JSON.stringify({
        code: 0,
        data: { items: [{ chat_id: "oc_team", name: "产品群" }], has_more: false },
      }), { status: 200 });
    }) as typeof fetch;
    const targets = await listFeishuTargets(integration.id);
    assert.deepEqual(targets, [{ id: "oc_team", name: "产品群", kind: "chat" }]);
    assert.match(requests[0], /tenant_access_token\/internal/);
    assert.match(requests[1], /\/im\/v1\/chats/);

    assert.equal(renderIntegrationTemplate("标题：{{data.title}}", {
      version: 1,
      data: { title: "周报" },
      meta: {},
    }), "标题：周报");
    assert.throws(() => renderIntegrationTemplate("{{data.missing}}", {
      version: 1,
      data: {},
      meta: {},
    }), /没有可用值/);
  } finally {
    globalThis.fetch = originalFetch;
    closeDatabase();
  }
});

test("飞书消息工作流从成功 Checkpoint 恢复时不会重复发送", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  let sendCount = 0;
  const dispose = registerWorkflowRuntime({
    runAgent: async () => ({ ok: true, summary: "unused" }),
    sendIntegrationMessage: async () => {
      sendCount += 1;
      return {
        integrationId: "int-feishu",
        targetId: "oc_team",
        messageLength: 4,
        messageHash: "hash-only",
      };
    },
    notify: () => undefined,
    changed: () => undefined,
  });
  try {
    const folder = createFolder({
      name: "飞书工作流测试",
      category: "test",
      priority: "medium",
      deadline: null,
      agentEnabled: false,
    });
    const workflow = createWorkflow({
      name: "发送飞书通知",
      enabled: false,
      trigger: { type: "manual", label: "手动执行", folderId: folder.id },
      conditions: [],
      actions: [{
        id: "send-feishu",
        type: "send_feishu_message",
        label: "发送飞书消息",
        config: {
          folderId: folder.id,
          integrationId: "int-feishu",
          integrationTargetId: "oc_team",
          messageTemplate: "{{data}}",
        },
      }],
      layout: [
        { id: "node-trigger", kind: "trigger", refId: "trigger", x: 32, y: 56 },
        { id: "node-send", kind: "action", refId: "send-feishu", x: 276, y: 56 },
      ],
    });
    const run = await runWorkflow(workflow.id, {
      type: "manual",
      folderId: folder.id,
      timestamp: Date.now(),
    });
    assert.equal(run.status, "success");
    assert.equal(sendCount, 1);
    const resumed = await resumeWorkflowRun(run.id);
    assert.equal(resumed.status, "success");
    assert.equal(sendCount, 1);
    const step = WorkflowStepRunRepository.find(run.id, "send-feishu");
    assert.equal(step?.status, "succeeded");
    assert.doesNotMatch(JSON.stringify(step?.output), /Mission Console|测试消息正文/);
  } finally {
    dispose();
    closeDatabase();
  }
});

test("待办可在 Human 与 Agent 之间显式转交并保存执行方式", () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  try {
    const folder = createFolder({
      name: "负责人转交测试",
      category: "test",
      priority: "medium",
      deadline: null,
      agentEnabled: true,
    });
    const created = createTodo(folder.id, {
      title: "整理发布文案",
      dueDate: null,
      assignee: "human",
    });
    const todoId = created.todos[0].id;

    const assignedToAgent = updateTodoAssignment(folder.id, todoId, {
      assignee: "agent",
      agentTaskType: "artifact",
      artifactFormat: "markdown",
    });
    assert.equal(assignedToAgent.todos[0].assignee, "agent");
    assert.equal(assignedToAgent.todos[0].agentTaskType, "artifact");
    assert.equal(assignedToAgent.todos[0].artifactFormat, "markdown");
    assert.ok(assignedToAgent.timeline.some((entry) => /转交 Agent/.test(entry.action)));

    const returnedToHuman = updateTodoAssignment(folder.id, todoId, { assignee: "human" });
    assert.equal(returnedToHuman.todos[0].assignee, "human");
    assert.equal(returnedToHuman.todos[0].workflowId, null);
    assert.ok(returnedToHuman.timeline.some((entry) => /Human/.test(entry.action)));
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

test("材料巡检即时识别失效引用，且无需模型也不会自动删除记录", async () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();
  const existingPath = path.join(os.tmpdir(), `mission-console-material-${Date.now()}.txt`);
  fs.writeFileSync(existingPath, "available", "utf8");
  try {
    const folder = createFolder({
      name: "材料巡检",
      category: "test",
      priority: "medium",
      deadline: null,
      agentEnabled: true,
    });
    addMaterial(folder.id, { type: "doc", name: "可用材料", content: existingPath });
    const missingPath = path.join(os.tmpdir(), `mission-console-missing-${Date.now()}.png`);
    const missing = addMaterial(folder.id, { type: "image", name: "失效图片", content: missingPath });
    const auditTodo = createTodo(folder.id, {
      title: "巡检失效材料引用",
      dueDate: null,
      assignee: "agent",
      agentTaskType: "material_audit",
    });
    updateAgentConfig(folder.id, { permissions: { read: true, write: true }, strategy: "material_collect" });

    const availability = inspectMaterialAvailability(getFolderDetail(folder.id)?.materials ?? []);
    assert.deepEqual(availability.find((item) => item.materialId === missing.id), {
      materialId: missing.id,
      availability: "missing",
    });

    const result = await runAgentOnce(folder.id, { apiKey: "", baseUrl: "https://example.invalid", model: "test" });
    assert.equal(result.ok, true);
    assert.equal(result.action, "material_audit_completed");
    assert.match(result.summary, /1 个不可用引用/);
    const afterAudit = getFolderDetail(folder.id)!;
    assert.equal(afterAudit.materials.length, 2);
    assert.equal(afterAudit.todos.find((todo) => todo.id === auditTodo.todos[0].id)?.done, true);

    const heartbeatAudit = await runAgentOnce(folder.id, { apiKey: "", baseUrl: "https://example.invalid", model: "test" });
    assert.equal(heartbeatAudit.ok, true);
    assert.equal(heartbeatAudit.action, "material_audit_completed");
  } finally {
    if (fs.existsSync(existingPath)) fs.unlinkSync(existingPath);
    closeDatabase();
  }
});
