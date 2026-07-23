import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [packagePath, version, repository, outputDirectory] = process.argv.slice(2);
if (!packagePath || !/^\d+\.\d+\.\d+$/.test(version || "") || !/^[^/]+\/[^/]+$/.test(repository || "") || !outputDirectory) {
  throw new Error("Usage: node scripts/create-release-assets.mjs <package.tgz> <version> <owner/repo> <output-dir>");
}
const packageName = `mission-console-${version}.tgz`;
if (path.basename(packagePath) !== packageName) throw new Error(`Expected ${packageName}.`);
const bytes = await readFile(packagePath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const tag = `v${version}`;
const releaseBase = `https://github.com/${repository}/releases`;
const downloadBase = `${releaseBase}/download/${tag}`;
const manifest = {
  schemaVersion: 1,
  version,
  tag,
  title: `Mission Console ${tag}`,
  publishedAt: new Date().toISOString(),
  releaseUrl: `${releaseBase}/tag/${tag}`,
  notes: { features: [], fixes: [] },
  package: {
    name: packageName,
    url: `${downloadBase}/${packageName}`,
    sha256,
    checksumUrl: `${downloadBase}/${packageName}.sha256`,
  },
};
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, "mission-console.tgz"), bytes),
  writeFile(path.join(outputDirectory, `${packageName}.sha256`), `${sha256}  ${packageName}\n`),
  writeFile(path.join(outputDirectory, "mission-console.tgz.sha256"), `${sha256}  mission-console.tgz\n`),
  writeFile(path.join(outputDirectory, "update.json"), `${JSON.stringify(manifest, null, 2)}\n`),
]);
