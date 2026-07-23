import fs from "node:fs";
import path from "node:path";
import type { ArtifactFormat, Material, TaskFolder, Todo } from "../../renderer/types";

const TEXT_EXTENSIONS = new Set([".json", ".txt", ".md", ".csv", ".yaml", ".yml"]);
const MAX_FILE_CHARS = 80_000;
const MAX_CONTEXT_CHARS = 160_000;

export interface MaterialTaskContext {
  todo: Todo;
  sourceText: string;
  outputDirectory: string;
  imageReferences: Array<{ name: string; markdownTarget: string }>;
  format: ArtifactFormat;
}

function existingLocalPath(material: Material): string | null {
  const candidate = material.content.trim();
  if (!candidate || !path.isAbsolute(candidate)) return null;
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function markdownTarget(outputDirectory: string, filePath: string): string {
  const relative = path.relative(outputDirectory, filePath).replaceAll("\\", "/");
  return `<./${relative}>`;
}

export function prepareMaterialTask(
  folder: TaskFolder,
  todo: Todo,
  artifactRoot?: string,
): MaterialTaskContext {

  const localMaterials = folder.materials
    .map((material) => ({ material, filePath: existingLocalPath(material) }))
    .filter((item): item is { material: Material; filePath: string } => item.filePath !== null);
  const outputDirectory = artifactRoot
    ? path.join(artifactRoot, safeBaseName(folder.id))
    : localMaterials[0]
      ? path.dirname(localMaterials[0].filePath)
      : path.join(process.cwd(), "artifacts", safeBaseName(folder.id));
  const sections: string[] = [];
  let totalChars = 0;

  for (const material of folder.materials) {
    const filePath = existingLocalPath(material);
    if (filePath) {
      const extension = path.extname(filePath).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) continue;
      const content = fs.readFileSync(filePath, "utf8").slice(0, MAX_FILE_CHARS);
      const remaining = MAX_CONTEXT_CHARS - totalChars;
      if (remaining <= 0) break;
      const accepted = content.slice(0, remaining);
      sections.push(`### 材料：${material.name}\n来源路径：${filePath}\n\n${accepted}`);
      totalChars += accepted.length;
      continue;
    }
    if (material.type === "note" && material.content.trim()) {
      const remaining = MAX_CONTEXT_CHARS - totalChars;
      if (remaining <= 0) break;
      const accepted = material.content.trim().slice(0, remaining);
      sections.push(`### 笔记：${material.name}\n\n${accepted}`);
      totalChars += accepted.length;
    }
  }

  const imageReferences = localMaterials
    .filter(({ material, filePath }) =>
      material.type === "image" || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filePath),
    )
    .map(({ material, filePath }) => ({
      name: material.name,
      markdownTarget: markdownTarget(outputDirectory, filePath),
    }));

  return {
    todo,
    sourceText: sections.join("\n\n---\n\n"),
    outputDirectory,
    imageReferences,
    format: todo.artifactFormat ?? "markdown",
  };
}

function safeBaseName(value: string): string {
  const withoutControlCharacters = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? "-" : character,
  ).join("");
  const cleaned = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return cleaned || "mission-output";
}

function stripMarkdownFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:markdown|md|json|text|txt)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : trimmed;
}

export function writeArtifact(
  folder: TaskFolder,
  task: MaterialTaskContext,
  generated: string,
): string {
  fs.mkdirSync(task.outputDirectory, { recursive: true });
  let content = stripMarkdownFence(generated);
  if (task.format === "markdown") {
    const missingImages = task.imageReferences.filter(
      ({ markdownTarget: target }) => !content.includes(target),
    );
    if (missingImages.length > 0) {
      content += "\n\n## 配图\n\n";
      content += missingImages
        .map(({ name, markdownTarget: target }) => `![${path.parse(name).name}](${target})`)
        .join("\n\n");
    }
  } else if (task.format === "json") {
    try {
      content = `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
    } catch {
      content = `${JSON.stringify({ content: content.trim() }, null, 2)}\n`;
    }
  }
  content = `${content.trim()}\n`;

  const extension = task.format === "markdown" ? ".md" : task.format === "json" ? ".json" : ".txt";
  const base = `${safeBaseName(folder.name)}-${safeBaseName(task.todo.title).slice(0, 32)}`;
  let outputPath = path.join(task.outputDirectory, `${base}${extension}`);
  if (fs.existsSync(outputPath)) {
    outputPath = path.join(task.outputDirectory, `${base}-${Date.now()}${extension}`);
  }
  fs.writeFileSync(outputPath, content, { encoding: "utf8", flag: "wx" });
  return outputPath;
}

/** 兼容旧调用；新代码使用 writeArtifact。 */
export const writeMarkdownArtifact = writeArtifact;
