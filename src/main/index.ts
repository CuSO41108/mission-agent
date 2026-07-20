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
import { fileURLToPath } from "node:url";
import type { TaskFolder, UpsertIntegrationInput } from "../renderer/types";
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
  deleteMaterial,
  toggleAgent,
  updateAgentConfig,
  toggleWorkflow,
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
} from "./scheduler";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRODUCT_NAME = "Mission Console";
const APP_ID = "com.mission-console.app";
const DEFAULT_SHORTCUT = process.platform === "darwin" ? "Option+Space" : "Ctrl+Alt+Space";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let registeredShortcut: string | null = null;
let isQuitting = false;
// 应用配置（启动时加载，IPC 更新时同步到内存 + 磁盘）
let appConfig: AppConfig | null = null;

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
      sandbox: false, // 后续接 node:sqlite 时可能需要 true，目前 preload 只用 ipcRenderer
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
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
  // 生成一个简单的占位图标（16x16 青色方块）
  const icon = nativeImage.createEmpty();
  // TODO: 后续替换为 assets/tray-icon.png
  // 目前用系统默认图标占位
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
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = null;
  }
  if (!accelerator) return true;
  const ok = globalShortcut.register(accelerator, toggleWindow);
  if (ok) {
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
  const userDataDir = app.getPath("userData");
  const configPath = path.join(userDataDir, "config.yaml");
  appConfig = initConfigFile(configPath);
  console.log(`[config] 已加载 ${configPath}`);
}

// 获取当前配置（IPC handler 用）
function getConfig(): AppConfig {
  if (!appConfig) {
    // 理论上不会走到这里，whenReady 时已 init
    const userDataDir = app.getPath("userData");
    const configPath = path.join(userDataDir, "config.yaml");
    appConfig = loadConfig(configPath);
  }
  return appConfig;
}

// 更新配置（partial merge → 内存 + 磁盘）
function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const userDataDir = app.getPath("userData");
  const configPath = path.join(userDataDir, "config.yaml");
  const current = getConfig();
  const merged = mergeConfig(current, partial);
  saveConfig(configPath, merged);
  appConfig = merged;

  // 同步运行时状态：快捷键变了就重注册
  if (
    partial.system?.globalShortcut &&
    partial.system.globalShortcut !== registeredShortcut
  ) {
    registerShortcut(partial.system.globalShortcut);
  }
  // 同步运行时状态：开关变化时启动/停止固定的每小时调度器
  if (partial.agent && mainWindow) {
    startScheduler(getConfig, mainWindow);
  }

  return merged;
}

// ============ IPC 注册 ============
// IPC handler 路由：渲染进程 invoke 的 channel → 调 core/Service
// Phase 3：读操作；Phase 4：加 config 读写 + DeepSeek 测试
function registerIpc(): void {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:platform", () => process.platform);

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

  // ============ 配置（Phase 4） ============
  // 获取完整配置（API key 等敏感字段也返回，渲染层需要回填表单）
  ipcMain.handle("config:get", () => getConfig());
  // 更新配置（partial merge），返回合并后的完整 config
  ipcMain.handle("config:set", (_e: unknown, partial: Partial<AppConfig>) =>
    updateConfig(partial),
  );
  // 测试 DeepSeek 连接：发一个最小请求验证 key
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
  // Agent 开关
  ipcMain.handle(
    "agent:toggle",
    (_e, folderId: string, enabled: boolean) => {
      toggleAgent(folderId, enabled);
      return true;
    },
  );
  ipcMain.handle(
    "agent:updateConfig",
    (_e, folderId: string, input: Parameters<typeof updateAgentConfig>[1]) =>
      updateAgentConfig(folderId, input),
  );
  // Workflow 开关
  ipcMain.handle(
    "workflow:toggle",
    (_e, workflowId: string, enabled: boolean) => {
      toggleWorkflow(workflowId, enabled);
      return true;
    },
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
  createTray();
  registerIpc();
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
  closeDatabase();
});

// 防止后台静默崩溃
process.on("uncaughtException", (err) => {
  console.error("[uncaught]", err);
});
