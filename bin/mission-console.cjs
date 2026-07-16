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

// require("electron") 在 npm 包里返回 Electron 可执行文件路径
let electronPath;
try {
  electronPath = require("electron");
} catch (err) {
  console.error("[mission-console] 启动失败：找不到 electron 可执行文件");
  console.error("");
  console.error("请确认已运行 npm install 安装依赖");
  console.error("");
  console.error("原始错误：" + err.message);
  process.exit(1);
}

const appEntry = path.join(__dirname, "..", "out", "main", "index.js");

const child = spawn(electronPath, [appEntry], {
  detached: true,
  stdio: "ignore",
});

child.on("error", (error) => {
  console.error("[mission-console] 启动失败：" + error.message);
  console.error("");
  console.error("请检查：");
  console.error("  1. Node 版本 >= 22.13（当前：" + process.version + "）");
  console.error("  2. 已运行 npm run build 构建产物");
  console.error("  3. 未被其他实例占用");
  process.exit(1);
});

// 子进程脱离父进程，shell 立即返回
child.unref();
