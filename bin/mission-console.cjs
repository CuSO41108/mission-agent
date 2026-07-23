#!/usr/bin/env node
/**
 * Mission Console · 全局命令启动器
 *
 * 通过 Node 启动 Electron，而非双击 .exe/.app bundle。
 * 这样可以绕过 macOS Gatekeeper 的代码签名 / 公证要求，
 * 跨平台一份代码，安装/升级就是 git pull && npm ci && npm install -g .
 *
 * 必须是纯 CJS + 零依赖（bin/ 下的脚本只依赖 Node 内置模块）
 * 因为 npm publish 时 files 只包含 out/bin/assets，不含 node_modules
 */
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const packagePath = path.resolve(__dirname, "..");

function updateClient() {
  return require("./update-client.cjs");
}

async function runUpdate() {
  const client = updateClient();
  const result = await client.checkForUpdate({ currentVersion: client.currentVersion() });
  if (result.error) throw new Error(`检查更新失败：${result.error}`);
  if (!result.updateAvailable) {
    process.stdout.write(`Mission Console v${result.currentVersion} 已是最新版本。\n`);
    return;
  }
  process.stdout.write(`${client.formatUpdateNotice(result)}\n\n正在安装更新，完成后会重新启动应用。\n`);
  const child = spawn(process.execPath, [path.join(__dirname, "apply-update.cjs")], {
    detached: false,
    stdio: "inherit",
    env: { ...process.env, MISSION_CONSOLE_NODE_PATH: process.execPath },
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const client = updateClient();
  if (args.has("--version") || args.has("-v")) {
    process.stdout.write(`${client.currentVersion()}\n`);
    return;
  }
  if (args.has("--check-update")) {
    const result = await client.checkForUpdate({ currentVersion: client.currentVersion(), force: true });
    if (result.error) throw new Error(`检查更新失败：${result.error}`);
    process.stdout.write(result.updateAvailable ? `${client.formatUpdateNotice(result)}\n` : `Mission Console v${result.currentVersion} 已是最新版本。\n`);
    return;
  }
  if (args.has("--update")) {
    await runUpdate();
    return;
  }
  launchApp();
}

// require("electron") 在 npm 包里返回 Electron 可执行文件路径
function launchApp() {
  if (!fs.existsSync(path.join(packagePath, "out", "main", "index.js"))) {
    throw new Error("找不到应用构建产物。请重新安装 Mission Console。");
  }
  const electronPath = require("electron");
  const appEntry = path.join(packagePath, "out", "main", "index.js");
  const child = spawn(electronPath, [appEntry], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, MISSION_CONSOLE_NODE_PATH: process.execPath, MISSION_CONSOLE_RELEASE_BUILD: "1" },
  });
  child.on("error", (error) => {
    console.error("[mission-console] 启动失败：" + error.message);
    process.exitCode = 1;
  });
  child.unref();
}

main().catch((error) => {
  console.error(`[mission-console] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
