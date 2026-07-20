import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { load as yamlLoad } from "js-yaml";
import { initConfigFile } from "../src/core/config/configLoader";
import { closeDatabase, initDatabase } from "../src/core/db/client";
import { migrateDatabase } from "../src/core/db/migrate";
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
  toggleTodo,
} from "../src/core/services/mutationService";

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
    assert.equal(toggleTodo(folder.id, withTodo.todos[0].id, true).todos[0].done, true);

    const material = addMaterial(folder.id, {
      type: "file",
      name: "source.txt",
      content: "C:\\fixtures\\source.txt",
    });
    assert.equal(getFolderDetail(folder.id)?.materials[0]?.id, material.id);

    assert.throws(() => deleteFolder(folder.id), /必须先归档/);
    assert.equal(deleteMaterial(folder.id, material.id), true);
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
