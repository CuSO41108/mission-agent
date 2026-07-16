/**
 * Mission Console · 主进程入口
 * 负责：窗口/托盘/全局快捷键/生命周期/IPC 注册
 * 业务逻辑全部下沉到 src/core/
 */
import { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { initDatabase, closeDatabase } from "../core/db/client";
import { migrateDatabase, getSchemaVersion } from "../core/db/migrate";
import { seedDatabase } from "../core/db/seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRODUCT_NAME = "Mission Console";
const APP_ID = "com.mission-console.app";
const DEFAULT_SHORTCUT = process.platform === "darwin" ? "Option+Space" : "Ctrl+Alt+Space";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let registeredShortcut: string | null = null;
let isQuitting = false;

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
          // TODO: Phase 2 接入 core/runtime/heartbeat.ts
          mainWindow?.webContents.send("agent:event", {
            type: "info",
            title: "心跳触发",
            body: "手动执行了一次心跳扫描（Phase 2 接入后生效）",
          });
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

// ============ IPC 注册 ============
// IPC handler 路由：渲染进程 invoke 的 channel → 调 core/Service
// Phase 3：只接读操作，写操作留到后续 Phase
function registerIpc(): void {
  const { ipcMain } = require("electron");
  const {
    getAllFoldersWithDetails,
    getFolderDetail,
    getAllIntegrations,
    getAllWorkflows,
  } = require("../core/services");

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:platform", () => process.platform);

  // 任务舱
  ipcMain.handle("folder:list", () => getAllFoldersWithDetails());
  ipcMain.handle("folder:get", (_e: unknown, id: string) => getFolderDetail(id));

  // 接口适配器
  ipcMain.handle("integration:list", () => getAllIntegrations());

  // 工作流
  ipcMain.handle("workflow:list", () => getAllWorkflows());

  // 设置（Phase 4 接 config.yaml）
  ipcMain.handle("settings:get", (_event: unknown, key: string) => {
    if (key === "globalShortcut") return DEFAULT_SHORTCUT;
    if (key === "openAtLogin") return false;
    if (key === "heartbeatInterval") return 30;
    return null;
  });
  ipcMain.handle("settings:set", (_event: unknown, _key: string, _value: unknown) => {
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
  createWindow();
  createTray();
  registerIpc();
  registerShortcut(DEFAULT_SHORTCUT);
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
  closeDatabase();
  // TODO: Phase 3+ 接入 core/runtime/shutdown.ts，关闭：
  //   - heartbeat scheduler
  //   - Agent workers
  //   - 邮件/飞书 long-poll
});

// 防止后台静默崩溃
process.on("uncaughtException", (err) => {
  console.error("[uncaught]", err);
});
