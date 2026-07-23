/**
 * Mission Console · 主进程入口
 * 负责：窗口/托盘/全局快捷键/生命周期/IPC 注册
 * 业务逻辑全部下沉到 src/core/
 */
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  dialog,
  globalShortcut,
  nativeImage,
  safeStorage,
  shell,
  ipcMain,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { TaskFolder, UpsertIntegrationInput, UpsertWorkflowInput } from "../renderer/types";
import { initDatabase, closeDatabase } from "../core/db/client";
import { migrateDatabase, getSchemaVersion } from "../core/db/migrate";
import { seedDatabase } from "../core/db/seed";
// 关键：用 ES import 而非函数内 require
// electron-vite 只会把 import 依赖打包进 out/main/index.js
// 动态 require 在 ESM 项目里不会被 bundler 处理，运行时找不到模块
import {
  getAllFoldersWithDetails,
  getFolderDetail,
  getAllIntegrations,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  getAllWorkflows,
  createFolder,
  createTodo,
  deleteFolder,
  setFolderStatus,
  toggleTodo,
  addMaterial,
  updateNoteMaterial,
  deleteMaterial,
  toggleAgent,
  updateAgentConfig,
  toggleWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getWorkflowRuns,
} from "../core/services";
import {
  initConfigFile,
  loadConfig,
  saveConfig,
  mergeConfig,
  testDeepSeek,
  type AppConfig,
} from "../core/config";
import {
  getSchedulerStatus,
  runFolderOnce,
  runTickOnce,
  startScheduler,
  stopScheduler,
  configureAgentRuntime,
} from "./scheduler";
import { DEEPSEEK_REQUEST_TIMEOUT_MS } from "./schedulerPolicy";
import {
  registerWorkflowRuntime,
  runDueScheduledWorkflows,
  runWorkflow,
} from "../core/workflow";
import { analyzeWithCopilot, draftWithCopilot } from "../core/copilot/copilotService";
import { AgentRunRepository } from "../core/repositories/agentRunRepository";
import { agentRunQueue } from "../core/agent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const PRODUCT_NAME = "Mission Console";
const APP_ID = "com.mission-console.app";
const DEFAULT_SHORTCUT = process.platform === "darwin" ? "Option+Space" : "Ctrl+Alt+Space";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let registeredShortcut: string | null = null;
let isQuitting = false;
// 应用配置（启动时加载，IPC 更新时同步到内存 + 磁盘）
let appConfig: AppConfig | null = null;
let disposeWorkflowRuntime: (() => void) | null = null;
let workflowTimer: ReturnType<typeof setInterval> | null = null;
let workflowTickRunning = false;

function configPath(): string {
  return path.join(app.getPath("userData"), "config.yaml");
}

function modelSecretPath(): string {
  return path.join(app.getPath("userData"), "model-api-key.secret");
}

function saveModelApiKey(apiKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储暂不可用，API Key 未保存");
  }
  fs.writeFileSync(modelSecretPath(), safeStorage.encryptString(apiKey).toString("base64"), "utf8");
}

function loadModelApiKey(): string {
  const secretPath = modelSecretPath();
  if (!fs.existsSync(secretPath)) return "";
  if (!safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(fs.readFileSync(secretPath, "utf8"), "base64"));
  } catch (error) {
    console.error("[config] 模型 API Key 解密失败：", error);
    return "";
  }
}

function publicConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    deepseek: {
      ...config.deepseek,
      apiKey: "",
      apiKeyConfigured: Boolean(config.deepseek.apiKey),
    },
    system: { ...config.system, autoLaunch: false },
  };
}

function persistConfig(config: AppConfig): void {
  saveConfig(configPath(), publicConfig(config));
}

function protectIntegrationSecrets(input: UpsertIntegrationInput): UpsertIntegrationInput {
  const secrets = input.secrets;
  if (!secrets) return input;
  const protectedSecrets: UpsertIntegrationInput["secrets"] = {};
  for (const [key, value] of Object.entries(secrets)) {
    if (value === null) {
      protectedSecrets[key as keyof NonNullable<UpsertIntegrationInput["secrets"]>] = null;
      continue;
    }
    if (!value.trim()) continue;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储暂不可用，凭据未保存");
    }
    protectedSecrets[key as keyof NonNullable<UpsertIntegrationInput["secrets"]>] =
      safeStorage.encryptString(value).toString("base64");
  }
  return { ...input, secrets: protectedSecrets };
}

// ============ 应用标识 ============
app.setName(PRODUCT_NAME);
app.setAppUserModelId(APP_ID);

// ============ 单实例锁 ============
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ============ 窗口创建 ============
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 860,
    minHeight: 560,
    title: PRODUCT_NAME,
    show: false, // 防首屏白屏，ready-to-show 后再 show
    backgroundColor: "#0a0b0d",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    void checkForAutomaticAppUpdate();
  });

  // 点击关闭按钮时隐藏而非退出（托盘常驻）
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // dev/prod 分流
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    // DevTools 不自动打开，需要时按 F12 / Ctrl+Shift+I 手动唤起
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

// ============ 托盘 ============
function createTray(): void {
  tray?.destroy();
  tray = null;
  const iconPath = path.join(app.getAppPath(), "assets", "tray-icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.error(`[tray] 无法加载图标：${iconPath}`);
    return;
  }
  tray = new Tray(icon);
  tray.setToolTip(PRODUCT_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `打开 ${PRODUCT_NAME}`, click: showWindow },
      { type: "separator" },
      {
        label: "立即执行心跳",
        click: () => {
          if (mainWindow) {
            void runTickOnce(getConfig, mainWindow).catch((err) => {
              console.error("[scheduler] 托盘手动心跳失败：", err);
            });
          }
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", showWindow);
}

// ============ 窗口显示/隐藏 ============
function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

// ============ 全局快捷键 ============
function registerShortcut(accelerator: string): boolean {
  if (registeredShortcut === accelerator) return true;
  if (!accelerator) {
    if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
    registeredShortcut = null;
    return true;
  }
  let ok = false;
  try {
    ok = globalShortcut.register(accelerator, toggleWindow);
  } catch {
    ok = false;
  }
  if (ok) {
    if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
    registeredShortcut = accelerator;
    console.log(`[shortcut] registered: ${accelerator}`);
  } else {
    console.error(`[shortcut] failed to register: ${accelerator}`);
  }
  return ok;
}

// ============ 配置初始化 ============
// 由 main 进程负责：读取 userData/config.yaml，不存在则创建默认
function initAppConfig(): void {
  const loaded = initConfigFile(configPath());
  let apiKey = loadModelApiKey();
  const legacyKey = loaded.deepseek.apiKey.trim();
  if (!apiKey && legacyKey) {
    saveModelApiKey(legacyKey);
    apiKey = legacyKey;
    console.log("[config] 已将 YAML 中的模型 API Key 迁移到系统安全存储");
  }
  appConfig = {
    ...loaded,
    deepseek: { ...loaded.deepseek, apiKey, apiKeyConfigured: Boolean(apiKey) },
    system: { ...loaded.system, autoLaunch: false },
  };
  persistConfig(appConfig);
  console.log(`[config] 已加载 ${configPath()}`);
}

// 获取当前配置（IPC handler 用）
function getConfig(): AppConfig {
  if (!appConfig) {
    // 理论上不会走到这里，whenReady 时已 init
    const loaded = loadConfig(configPath());
    const apiKey = loadModelApiKey() || loaded.deepseek.apiKey;
    appConfig = { ...loaded, deepseek: { ...loaded.deepseek, apiKey, apiKeyConfigured: Boolean(apiKey) } };
  }
  return appConfig;
}

// 更新配置（partial merge → 内存 + 磁盘）
function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const current = getConfig();
  const requestedShortcut = partial.system?.globalShortcut;
  if (requestedShortcut !== undefined && requestedShortcut !== registeredShortcut) {
    if (!registerShortcut(requestedShortcut)) {
      throw new Error("快捷键格式无效或已被其他应用占用，原快捷键保持不变");
    }
  }
  const incomingKey = partial.deepseek?.apiKey?.trim();
  if (incomingKey) saveModelApiKey(incomingKey);
  const merged = mergeConfig(current, {
    ...partial,
    deepseek: partial.deepseek
      ? { ...partial.deepseek, apiKey: incomingKey || current.deepseek.apiKey, apiKeyConfigured: Boolean(incomingKey || current.deepseek.apiKey) }
      : undefined,
    system: partial.system ? { ...partial.system, autoLaunch: false } : undefined,
  });
  appConfig = merged;
  persistConfig(merged);

  // 同步运行时状态：快捷键变了就重注册
  // 同步运行时状态：开关变化时启动/停止固定的每小时调度器
  if (partial.agent && mainWindow) {
    startScheduler(getConfig, mainWindow);
    agentRunQueue.notifyRuntimeChanged();
  }
  if (partial.system?.trayIcon !== undefined) {
    if (merged.system.trayIcon) createTray();
    else {
      tray?.destroy();
      tray = null;
    }
  }

  return publicConfig(merged);
}

type UpdateCheck = {
  currentVersion: string;
  updateAvailable: boolean;
  manifest: { version: string; notes?: { features?: string[]; fixes?: string[] } } | null;
  error: string | null;
};

function updateClient(): {
  checkForUpdate: (options: { currentVersion: string }) => Promise<UpdateCheck>;
} {
  return require(path.join(app.getAppPath(), "bin", "update-client.cjs"));
}

async function checkForAppUpdate(): Promise<UpdateCheck> {
  return updateClient().checkForUpdate({ currentVersion: app.getVersion() });
}

function startAppUpdate(): { ok: true } | { ok: false; error: string } {
  const nodePath = process.env.MISSION_CONSOLE_NODE_PATH;
  if (!nodePath) return { ok: false, error: "自动更新仅适用于通过 mission-console 全局安装的正式版。" };
  const updater = path.join(app.getAppPath(), "bin", "apply-update.cjs");
  const child = spawn(nodePath, [updater, "--wait-pid", String(process.pid)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, MISSION_CONSOLE_NODE_PATH: nodePath },
  });
  child.unref();
  setTimeout(() => {
    isQuitting = true;
    app.quit();
  }, 250);
  return { ok: true };
}

function updateCheckStatePath(): string {
  return path.join(app.getPath("userData"), "update-check.json");
}

function wasRecentlyCheckedForUpdates(): boolean {
  try {
    const value = JSON.parse(fs.readFileSync(updateCheckStatePath(), "utf8")) as { checkedAt?: unknown };
    return typeof value.checkedAt === "number" && Date.now() - value.checkedAt < UPDATE_CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}

async function checkForAutomaticAppUpdate(): Promise<void> {
  if (process.env.MISSION_CONSOLE_RELEASE_BUILD !== "1" || wasRecentlyCheckedForUpdates()) return;
  const result = await checkForAppUpdate();
  fs.writeFileSync(updateCheckStatePath(), JSON.stringify({ checkedAt: Date.now() }), "utf8");
  if (result.error || !result.updateAvailable || !result.manifest || !mainWindow || mainWindow.isDestroyed()) return;
  const notes = [...(result.manifest.notes?.features ?? []), ...(result.manifest.notes?.fixes ?? [])];
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: `${PRODUCT_NAME} 有新版本`,
    message: `发现 v${result.manifest.version}，是否立即安装？`,
    detail: notes.length ? notes.map((note) => `• ${note}`).join("\n") : "更新会下载经 SHA-256 校验的 GitHub Release，并在重启后生效。",
    buttons: ["立即更新", "稍后"],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice.response === 0) startAppUpdate();
}

// ============ IPC 注册 ============
// IPC handler 路由：渲染进程 invoke 的 channel → 调 core/Service
// Phase 3：读操作；Phase 4：加 config 读写 + 模型连接测试
function registerIpc(): void {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:platform", () => process.platform);
  ipcMain.handle("app:update:check", () => checkForAppUpdate());
  ipcMain.handle("app:update:install", () => startAppUpdate());

  // 任务舱
  ipcMain.handle("folder:list", () => getAllFoldersWithDetails());
  ipcMain.handle("folder:get", (_e: unknown, id: string) => getFolderDetail(id));
  ipcMain.handle("folder:create", (_e, input: Parameters<typeof createFolder>[0]) =>
    createFolder(input),
  );
  ipcMain.handle("folder:delete", (_e, folderId: string) => deleteFolder(folderId));

  // 接口适配器
  ipcMain.handle("integration:list", () => getAllIntegrations());
  ipcMain.handle("integration:create", (_e, input: UpsertIntegrationInput) =>
    createIntegration(protectIntegrationSecrets(input)),
  );
  ipcMain.handle("integration:update", (_e, id: string, input: UpsertIntegrationInput) =>
    updateIntegration(id, protectIntegrationSecrets(input)),
  );
  ipcMain.handle("integration:delete", (_e, id: string) => deleteIntegration(id));

  // 工作流
  ipcMain.handle("workflow:list", () => getAllWorkflows());
  ipcMain.handle("workflow:create", (_e, input: UpsertWorkflowInput) => createWorkflow(input));
  ipcMain.handle("workflow:update", (_e, id: string, input: UpsertWorkflowInput) => updateWorkflow(id, input));
  ipcMain.handle("workflow:delete", (_e, id: string) => deleteWorkflow(id));
  ipcMain.handle("workflow:runs", (_e, id: string) => getWorkflowRuns(id));
  ipcMain.handle("workflow:run", async (_e, id: string, folderId?: string | null) => {
    const run = await runWorkflow(id, {
      type: "manual",
      folderId: folderId ?? null,
      timestamp: Date.now(),
    });
    return run;
  });

  // ============ 配置（Phase 4） ============
  // 渲染层只得到“已配置”状态，不得到可逆的 API Key。
  ipcMain.handle("config:get", () => publicConfig(getConfig()));
  // 更新配置（partial merge），返回合并后的完整 config
  ipcMain.handle("config:set", (_e: unknown, partial: Partial<AppConfig>) =>
    updateConfig(partial),
  );
  // 测试 OpenAI 兼容模型连接：发一个最小请求验证 key
  ipcMain.handle("deepseek:test", async () => {
    try {
      const result = await testDeepSeek(getConfig().deepseek);
      return { ok: true, content: result.content, model: result.model };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // Copilot：模型只在用户显式选择“智能分析”或“创建草稿”时调用。
  // 上下文由主进程从本地数据库构建，渲染进程无法传入文件路径或凭据。
  ipcMain.handle("copilot:analyze", async (_e, prompt: string) => {
    try {
      const config = getConfig();
      const result = await analyzeWithCopilot(config.deepseek, getAllFoldersWithDetails(), prompt, {
        modelConcurrency: config.agent.maxConcurrentRuns,
        modelCapacityKey: `${config.deepseek.baseUrl}|${config.deepseek.model}`,
      });
      return { ok: true as const, result };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("copilot:draft", async (_e, prompt: string) => {
    try {
      const config = getConfig();
      const result = await draftWithCopilot(config.deepseek, getAllFoldersWithDetails(), prompt, {
        modelConcurrency: config.agent.maxConcurrentRuns,
        modelCapacityKey: `${config.deepseek.baseUrl}|${config.deepseek.model}`,
      });
      return { ok: true as const, result };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ============ 写操作（Phase 5） ============
  // folder 状态变更（归档/暂停/恢复/完成）
  ipcMain.handle(
    "folder:updateStatus",
    (_e, folderId: string, status: string) =>
      setFolderStatus(folderId, status as TaskFolder["status"]),
  );
  // todo 切换完成状态
  ipcMain.handle(
    "todo:create",
    (_e, folderId: string, input: Parameters<typeof createTodo>[1]) =>
      createTodo(folderId, input),
  );
  ipcMain.handle(
    "todo:toggle",
    (_e, folderId: string, todoId: string, done: boolean) => {
      return toggleTodo(folderId, todoId, done);
    },
  );
  // 添加材料
  ipcMain.handle("material:add", (_e, folderId: string, material: unknown) =>
    addMaterial(folderId, material as Parameters<typeof addMaterial>[1]),
  );
  ipcMain.handle("material:updateNote", (_e, folderId: string, materialId: string, content: string) =>
    updateNoteMaterial(folderId, materialId, content),
  );
  ipcMain.handle("material:delete", (_e, folderId: string, materialId: string) =>
    deleteMaterial(folderId, materialId),
  );
  ipcMain.handle("file:pickMaterial", async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: "选择要引用的材料文件",
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    return { path: filePath, name: path.basename(filePath) };
  });
  ipcMain.handle("material:open", async (_e, folderId: string, materialId: string) => {
    const material = getFolderDetail(folderId)?.materials.find((item) => item.id === materialId);
    if (!material) return { ok: false, error: "材料不存在或不属于当前任务舱" };
    const target = material.content.trim();
    if (/^https?:\/\//i.test(target)) {
      await shell.openExternal(target);
      return { ok: true };
    }
    if (!path.isAbsolute(target)) {
      return { ok: false, error: "该材料没有可打开的本地文件或链接" };
    }
    const error = await shell.openPath(target);
    return error ? { ok: false, error } : { ok: true };
  });
  ipcMain.handle("material:reveal", (_e, folderId: string, materialId: string) => {
    const material = getFolderDetail(folderId)?.materials.find((item) => item.id === materialId);
    if (!material) return { ok: false, error: "材料不存在或不属于当前任务舱" };
    const target = material.content.trim();
    if (!path.isAbsolute(target) || !fs.existsSync(target)) {
      return { ok: false, error: "该材料没有可定位的本地文件" };
    }
    shell.showItemInFolder(target);
    return { ok: true };
  });
  // Agent 开关
  ipcMain.handle(
    "agent:toggle",
    (_e, folderId: string, enabled: boolean) => toggleAgent(folderId, enabled),
  );
  ipcMain.handle(
    "agent:updateConfig",
    (_e, folderId: string, input: Parameters<typeof updateAgentConfig>[1]) =>
      updateAgentConfig(folderId, input),
  );
  // Workflow 开关
  ipcMain.handle(
    "workflow:toggle",
    (_e, workflowId: string, enabled: boolean) => toggleWorkflow(workflowId, enabled),
  );

  // ============ 心跳（Phase 5） ============
  // 手动触发一次心跳
  ipcMain.handle("agent:triggerHeartbeat", async () => {
    try {
      if (!mainWindow) throw new Error("主窗口尚未初始化");
      const result = await runTickOnce(getConfig, mainWindow);
      return {
        ok: true,
        scanned: result.scanned,
        executed: result.executed,
        succeeded: result.succeeded,
        failed: result.failed,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
  // 手动触发单个舱体的 Agent
  ipcMain.handle("agent:runOnce", async (_e, folderId: string) => {
    try {
      if (!mainWindow) throw new Error("主窗口尚未初始化");
      const result = await runFolderOnce(getConfig, mainWindow, folderId);
      return { ok: result.ok, summary: result.summary, error: result.error };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
  ipcMain.handle("agent:schedulerStatus", () => getSchedulerStatus());
  ipcMain.handle("agent:runs", (_e, folderId?: string | null, limit = 50) =>
    folderId
      ? AgentRunRepository.listRecentByFolder(folderId, Math.min(Math.max(limit, 1), 100))
      : AgentRunRepository.listRecent(Math.min(Math.max(limit, 1), 100)),
  );
  ipcMain.handle("agent:cancelRun", (_e, runId: string) => ({
    ok: agentRunQueue.cancel(runId),
  }));
  ipcMain.handle("agent:retryRun", (_e, runId: string) => {
    try {
      return { ok: true as const, run: agentRunQueue.retry(runId).run };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // 兼容旧 settings:get（让现有 store 不破，后续逐步迁移到 config:get）
  ipcMain.handle("settings:get", (_event: unknown, key: string) => {
    const cfg = getConfig();
    if (key === "globalShortcut") return cfg.system.globalShortcut;
    if (key === "openAtLogin") return cfg.system.autoLaunch;
    if (key === "heartbeatInterval") return cfg.agent.heartbeatIntervalMin;
    return null;
  });
  ipcMain.handle("settings:set", () => {
    return true;
  });

  // 通知：渲染层订阅 agent:event，主进程通过 webContents.send 主动推送
}

// ============ 数据库初始化 ============
// 由 main 进程负责：判断库文件是否存在 → 决定是否需要 seed
// 之后委托给 core 层执行（core 不 import electron，只接收字符串路径）
function initAppDatabase(): void {
  const userDataDir = app.getPath("userData");
  const dbPath = path.join(userDataDir, "mission.db");
  const isFirstLaunch = !fs.existsSync(dbPath);

  try {
    initDatabase({ dbPath });
    migrateDatabase();
    const interruptedRuns = AgentRunRepository.recoverInterruptedRuns();
    if (interruptedRuns > 0) {
      console.warn(`[agent-run] 已将 ${interruptedRuns} 个异常中断的 Run 标记为取消`);
    }
    if (isFirstLaunch) {
      seedDatabase();
      console.log(`[db] 首次启动，种子数据已写入 ${dbPath}`);
    } else {
      console.log(`[db] 已连接 ${dbPath}（schema v${getSchemaVersion()}）`);
    }
  } catch (err) {
    // 数据库初始化失败是致命错误，但不要让窗口也不起来
    // 渲染层会通过 IPC 查询时收到错误，提示用户
    console.error("[db] 初始化失败：", err);
  }
}

// ============ 应用生命周期 ============
app.whenReady().then(() => {
  initAppDatabase();
  initAppConfig();
  createWindow();
  if (getConfig().system.trayIcon) createTray();
  registerIpc();
  configureAgentRuntime(() => ({
    modelConcurrency: getConfig().agent.maxConcurrentRuns,
    modelCapacityKey: `${getConfig().deepseek.baseUrl}|${getConfig().deepseek.model}`,
    artifactRoot: getConfig().storage.vaultDir
      ? path.join(getConfig().storage.vaultDir, "agent-artifacts")
      : path.join(app.getPath("userData"), "artifacts"),
    notify: ({ title, body, folderId }) => {
      if (!mainWindow?.isDestroyed()) {
        mainWindow?.webContents.send("agent:event", {
          type: "agent_notification",
          title,
          body,
          folderId,
          timestamp: Date.now(),
        });
      }
    },
    runWorkflow: (workflowId, folderId) => runWorkflow(workflowId, {
      type: "manual",
      folderId,
      timestamp: Date.now(),
    }),
  }));
  agentRunQueue.configure(() => ({
    config: getConfig().deepseek,
    options: {
      modelConcurrency: getConfig().agent.maxConcurrentRuns,
      modelCapacityKey: `${getConfig().deepseek.baseUrl}|${getConfig().deepseek.model}`,
      requestTimeoutMs: DEEPSEEK_REQUEST_TIMEOUT_MS,
      artifactRoot: getConfig().storage.vaultDir
        ? path.join(getConfig().storage.vaultDir, "agent-artifacts")
        : path.join(app.getPath("userData"), "artifacts"),
      notify: ({ title, body, folderId }) => {
        if (!mainWindow?.isDestroyed()) {
          mainWindow.webContents.send("agent:event", {
            type: "agent_notification",
            title,
            body,
            folderId,
            timestamp: Date.now(),
          });
        }
      },
      runWorkflow: (workflowId, folderId) => runWorkflow(workflowId, {
        type: "manual",
        folderId,
        timestamp: Date.now(),
      }),
    },
  }), (run) => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send("agent:event", {
        type: "agent_run_changed",
        run,
        timestamp: Date.now(),
      });
    }
  });
  disposeWorkflowRuntime = registerWorkflowRuntime({
    runAgent: async (folderId) => {
      if (!mainWindow) return { ok: false, error: "主窗口尚未初始化" };
      const result = await runFolderOnce(getConfig, mainWindow, folderId, "workflow");
      return { ok: result.ok, summary: result.summary, error: result.error };
    },
    notify: (payload) => {
      if (!mainWindow?.isDestroyed()) {
        mainWindow?.webContents.send("workflow:event", {
          type: "notification",
          ...payload,
          timestamp: Date.now(),
        });
      }
    },
    changed: (folderIds) => {
      if (!mainWindow?.isDestroyed()) {
        mainWindow?.webContents.send("workflow:event", {
          type: "changed",
          folderIds,
          timestamp: Date.now(),
        });
      }
    },
  });
  workflowTimer = setInterval(() => {
    if (workflowTickRunning) return;
    workflowTickRunning = true;
    void runDueScheduledWorkflows()
      .then((runs) => {
        if (runs.length && !mainWindow?.isDestroyed()) {
          mainWindow?.webContents.send("workflow:event", { type: "runs_completed", runs, timestamp: Date.now() });
        }
      })
      .catch((error) => console.error("[workflow] 定时工作流执行失败：", error))
      .finally(() => { workflowTickRunning = false; });
  }, 60_000);
  // 注册配置中的快捷键（用户可能在设置页改过）
  registerShortcut(getConfig().system.globalShortcut || DEFAULT_SHORTCUT);
  // 启动心跳调度器（按配置的间隔与开关）
  if (mainWindow) {
    startScheduler(getConfig, mainWindow);
  }
});

// 单实例：第二个实例尝试启动时唤起窗口
app.on("second-instance", () => {
  showWindow();
});

// macOS: 点击 dock 图标时显示窗口
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showWindow();
  }
});

// 关闭所有窗口时不退出（托盘常驻）
app.on("window-all-closed", () => {
  // 故意空实现：Raycast 风格常驻
});

// 退出前清理
app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  stopScheduler();
  agentRunQueue.stop();
  disposeWorkflowRuntime?.();
  disposeWorkflowRuntime = null;
  if (workflowTimer) clearInterval(workflowTimer);
  workflowTimer = null;
  closeDatabase();
});

// 防止后台静默崩溃
process.on("uncaughtException", (err) => {
  console.error("[uncaught]", err);
});
