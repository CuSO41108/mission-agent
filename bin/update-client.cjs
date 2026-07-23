"use strict";

const { createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const REPOSITORY = "CuSO41108/mission-agent";
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases/latest`;
const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const MANIFEST_NAME = "update.json";
const USER_AGENT = "mission-console-updater";

function currentVersion() {
  try { return JSON.parse(require("node:fs").readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version; }
  catch { return "0.0.0"; }
}

function compareVersions(left, right) {
  const parse = (value) => {
    const match = String(value).replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) throw new Error(`无效版本号：${value}`);
    return match.slice(1).map(Number);
  };
  const a = parse(left); const b = parse(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return 0;
}

function validateManifest(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1) throw new Error("更新清单格式不受支持。");
  if (!/^\d+\.\d+\.\d+$/.test(value.version) || value.tag !== `v${value.version}`) throw new Error("更新清单版本无效。");
  const packageInfo = value.package;
  if (!packageInfo || typeof packageInfo !== "object" || !/^[a-f0-9]{64}$/i.test(packageInfo.sha256 || "")) throw new Error("更新包校验信息无效。");
  const expectedPrefix = `https://github.com/${REPOSITORY}/releases/download/${value.tag}/`;
  if (typeof packageInfo.url !== "string" || !packageInfo.url.startsWith(expectedPrefix) || !packageInfo.url.endsWith(".tgz")) throw new Error("更新包地址不可信。");
  return { ...value, package: { ...packageInfo, sha256: packageInfo.sha256.toLowerCase() } };
}

async function fetchWithTimeout(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT }, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function checkForUpdate({ currentVersion: installedVersion = currentVersion() } = {}) {
  try {
    const release = await fetchWithTimeout(RELEASE_API);
    if (release.status === 404) return { currentVersion: installedVersion, updateAvailable: false, manifest: null, error: null };
    if (!release.ok) throw new Error(`GitHub Release 检查失败（${release.status}）。`);
    const payload = await release.json();
    const asset = payload.assets?.find((item) => item?.name === MANIFEST_NAME);
    if (!asset?.browser_download_url) throw new Error("最新 Release 缺少 update.json。");
    const response = await fetchWithTimeout(asset.browser_download_url);
    if (!response.ok) throw new Error(`更新清单下载失败（${response.status}）。`);
    const manifest = validateManifest(await response.json());
    if (payload.tag_name !== manifest.tag) throw new Error("Release 标签与更新清单不匹配。");
    return { currentVersion: installedVersion, updateAvailable: compareVersions(installedVersion, manifest.version) < 0, manifest, error: null };
  } catch (error) {
    return { currentVersion: installedVersion, updateAvailable: false, manifest: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function formatUpdateNotice(result) {
  const notes = [...(result.manifest?.notes?.features || []), ...(result.manifest?.notes?.fixes || [])];
  return [`发现新版本：v${result.currentVersion} → v${result.manifest.version}`, ...notes.map((note) => `- ${note}`)].join("\n");
}

async function installLatestUpdate() {
  const result = await checkForUpdate();
  if (result.error) throw new Error(result.error);
  if (!result.updateAvailable) return null;
  const manifest = result.manifest;
  const response = await fetchWithTimeout(manifest.package.url, 120_000);
  if (!response.ok) throw new Error(`更新包下载失败（${response.status}）。`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.package.sha256) throw new Error("更新包 SHA-256 校验失败。");
  const archivePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "mission-console-update-")), `mission-console-${manifest.version}.tgz`);
  await fs.writeFile(archivePath, bytes);
  try {
    await execFileAsync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--global", archivePath, "--no-audit", "--no-fund"], {
      shell: process.platform === "win32", timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024,
    });
  } finally {
    await fs.unlink(archivePath).catch(() => undefined);
  }
  return manifest.version;
}

function launchInstalledApp() {
  const { spawn } = require("node:child_process");
  const command = process.platform === "win32" ? "mission-console.cmd" : "mission-console";
  const child = spawn(command, [], { detached: true, stdio: "ignore", shell: process.platform === "win32" });
  child.unref();
}

module.exports = { RELEASES_URL, currentVersion, checkForUpdate, formatUpdateNotice, installLatestUpdate, launchInstalledApp };
