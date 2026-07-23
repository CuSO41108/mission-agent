#!/usr/bin/env node
"use strict";

const { installLatestUpdate, launchInstalledApp } = require("./update-client.cjs");

function waitForProcessExit(pid, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      try { process.kill(pid, 0); } catch { clearInterval(timer); resolve(); return; }
      if (Date.now() >= deadline) { clearInterval(timer); resolve(); }
    }, 200);
  });
}

async function main() {
  const index = process.argv.indexOf("--wait-pid");
  const pid = Number(process.argv[index + 1]);
  if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) await waitForProcessExit(pid);
  const version = await installLatestUpdate();
  if (version) process.stdout.write(`Mission Console v${version} 安装完成，正在重新启动。\n`);
  launchInstalledApp();
}

main().catch((error) => {
  console.error(`Mission Console 更新失败：${error instanceof Error ? error.message : String(error)}`);
  console.error("请手动安装最新 Release：https://github.com/CuSO41108/mission-agent/releases/latest");
  process.exit(1);
});
