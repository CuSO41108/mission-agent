import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const { stdout } = await execFileAsync(npm, ["pack", "--dry-run", "--json"], {
  shell: process.platform === "win32",
  maxBuffer: 8 * 1024 * 1024,
});
const json = stdout.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/)?.[1];
if (!json) throw new Error("npm pack did not return package metadata.");
const [packed] = JSON.parse(json);
const files = new Set(packed.files.map((file) => file.path));
for (const required of ["bin/mission-console.cjs", "bin/update-client.cjs", "bin/apply-update.cjs", "out/main/index.js", "out/preload/index.mjs", "out/renderer/index.html", "assets/tray-icon.png"]) {
  if (!files.has(required)) throw new Error(`Published package is missing ${required}.`);
}
if ([...files].some((file) => file.startsWith("out/test/"))) throw new Error("Published package must not include test output.");
process.stdout.write(`Package check passed for ${packed.name}@${packed.version}.\n`);
