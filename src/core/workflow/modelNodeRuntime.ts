import fs from "node:fs";
import path from "node:path";
import { chat, type ChatContentPart, type ModelProfile } from "../config";
import { withModelCapacity } from "../agent/modelCapacity";
import { getFolderDetail } from "../services/folderService";
import { addMaterial } from "../services/mutationService";
import type { Material, WorkflowDataEnvelope, WorkflowGraphNode } from "../../renderer/types";

const MAX_IMAGES_PER_REQUEST = 10;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_INLINE_OUTPUT_BYTES = 256 * 1024;

export interface WorkflowModelRuntimeOptions {
  resolveProfile: (profileId: string) => ModelProfile | null;
  modelConcurrency: number;
  stateRoot: string;
  artifactRoot: string;
}

interface AgentNodeRequest {
  folderId: string;
  node: WorkflowGraphNode;
  input: WorkflowDataEnvelope;
  runId: string;
  stepId: string;
  idempotencyKey: string;
}

function safeSegment(value: string, fallback: string): string {
  const withoutControls = [...value.trim()].filter((character) => character.charCodeAt(0) >= 32).join("");
  const safe = withoutControls.replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").slice(0, 80);
  return safe || fallback;
}

function imageMime(filePath: string): string | null {
  switch (path.extname(filePath).toLocaleLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    default: return null;
  }
}

function isImageMaterial(material: Material): boolean {
  return material.type === "image" || Boolean(imageMime(material.content));
}

function triggerMaterialId(input: WorkflowDataEnvelope): string | null {
  const data = input.data as { trigger?: { materialId?: unknown } } | null;
  return typeof data?.trigger?.materialId === "string" ? data.trigger.materialId : null;
}

function selectImageMaterials(folderId: string, node: WorkflowGraphNode, input: WorkflowDataEnvelope): Material[] {
  const folder = getFolderDetail(folderId);
  if (!folder) throw new Error("Agent 节点找不到目标任务舱");
  const agent = node.config.agent;
  if (!agent) return [];
  const images = folder.materials.filter(isImageMaterial);
  if (agent.inputSource === "folder_images") return images;
  if (agent.inputSource === "selected_materials") {
    const selected = new Set(agent.materialIds ?? []);
    return images.filter((material) => selected.has(material.id));
  }
  if (agent.inputSource === "trigger_materials") {
    const materialId = triggerMaterialId(input);
    return materialId ? images.filter((material) => material.id === materialId) : [];
  }
  return [];
}

function imageParts(materials: Material[]): ChatContentPart[] {
  if (materials.length > MAX_IMAGES_PER_REQUEST) {
    throw new Error(`一次最多发送 ${MAX_IMAGES_PER_REQUEST} 张图片，请缩小材料范围`);
  }
  let totalBytes = 0;
  return materials.map((material) => {
    if (/^https?:\/\//i.test(material.content)) {
      return { type: "image_url", image_url: { url: material.content, detail: "auto" } };
    }
    if (!fs.existsSync(material.content)) throw new Error(`图片材料不存在：${material.name}`);
    const mime = imageMime(material.content);
    if (!mime) throw new Error(`不支持的图片格式：${material.name}`);
    const bytes = fs.readFileSync(material.content);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_IMAGE_BYTES) throw new Error("本次图片总大小超过 20 MB，请缩小材料范围");
    return {
      type: "image_url",
      image_url: { url: `data:${mime};base64,${bytes.toString("base64")}`, detail: "auto" },
    };
  });
}

function parseJsonContent(content: string): unknown {
  const clean = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("Agent 节点要求 JSON 输出，但模型返回的内容无法解析");
  }
}

function retryableModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(400|401|403|404)\b/.test(message)) return false;
  return /超时|timeout|timed out|\b429\b|\b5\d\d\b|fetch|network|ECONN/i.test(message);
}

async function callModelWithRetry<T>(retryCount: number, execute: () => Promise<T>): Promise<{ value: T; attempts: number }> {
  const maxAttempts = Math.max(1, Math.min(4, Math.round(retryCount) + 1));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { value: await execute(), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !retryableModelError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1_500, 250 * attempt)));
    }
  }
  throw lastError;
}

function readReferencedData(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const ref = (data as { $ref?: unknown }).$ref;
  if (typeof ref !== "string" || !fs.existsSync(ref)) return data;
  const raw = fs.readFileSync(ref, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function externalizeLargeOutput(
  envelope: WorkflowDataEnvelope,
  stateRoot: string,
  runId: string,
  stepId: string,
): WorkflowDataEnvelope {
  const serialized = JSON.stringify(envelope.data);
  if (Buffer.byteLength(serialized, "utf8") <= MAX_INLINE_OUTPUT_BYTES) return envelope;
  const runDirectory = path.join(stateRoot, safeSegment(runId, "run"));
  fs.mkdirSync(runDirectory, { recursive: true });
  const outputPath = path.join(runDirectory, `${safeSegment(stepId, "step")}.json`);
  if (!fs.existsSync(outputPath)) fs.writeFileSync(outputPath, serialized, "utf8");
  return {
    ...envelope,
    data: { $ref: outputPath, mediaType: "application/json" },
    artifacts: [...(envelope.artifacts ?? []), { name: `${stepId}.json`, mediaType: "application/json", ref: outputPath }],
  };
}

export function createWorkflowModelRuntime(options: WorkflowModelRuntimeOptions) {
  return {
    runAgentNode: async (request: AgentNodeRequest) => {
      const agent = request.node.config.agent;
      if (!agent) return { ok: false, error: `Agent 节点“${request.node.label}”缺少配置` };
      if (!agent.modelProfileId) return { ok: false, error: `Agent 节点“${request.node.label}”尚未选择模型配置` };
      const profile = options.resolveProfile(agent.modelProfileId);
      if (!profile) return { ok: false, error: `模型配置“${agent.modelProfileId}”不存在，请先配置` };
      if (!profile.apiKey) return { ok: false, error: `模型“${profile.name}”缺少 API Key，请先到设置中配置` };

      const images = selectImageMaterials(request.folderId, request.node, request.input);
      if (images.length > 0 && !profile.capabilities.includes("image")) {
        return { ok: false, error: `模型“${profile.name}”不支持图片输入` };
      }
      const inputData = readReferencedData(request.input.data);
      const schemaInstruction = agent.outputFormat === "json"
        ? `\n必须只返回合法 JSON，不要使用 Markdown 代码块。${agent.outputSchema ? `输出需符合：${JSON.stringify(agent.outputSchema)}` : ""}`
        : "";
      const content: ChatContentPart[] = [
        { type: "text", text: `节点输入 JSON：\n${JSON.stringify(inputData)}\n\n任务：${agent.prompt}${schemaInstruction}` },
        ...imageParts(images),
      ];
      const { value: result, attempts } = await callModelWithRetry(agent.retryCount ?? 1, () => withModelCapacity(
          `workflow-model:${profile.id}`,
          options.modelConcurrency,
          () => chat(profile, [
            { role: "system", content: agent.role },
            { role: "user", content },
          ], {
            maxTokens: agent.maxOutputTokens,
            timeoutMs: agent.timeoutMs,
            temperature: agent.temperature,
          }),
        ));
      const data = agent.outputFormat === "json" ? parseJsonContent(result.content) : result.content;
      const output = externalizeLargeOutput({
        version: 1,
        data,
        meta: {
          modelProfileId: profile.id,
          model: result.model,
          usage: result.usage,
          attempts,
          sourceStepId: request.stepId,
        },
      }, options.stateRoot, request.runId, request.stepId);
      return { ok: true, output, outputRef: output.artifacts?.at(-1)?.ref ?? null, summary: `${request.node.label} 执行完成` };
    },

    saveArtifact: async (request: AgentNodeRequest) => {
      const format = request.node.config.artifactFormat ?? "markdown";
      const extension = format === "markdown" ? "md" : format === "json" ? "json" : "txt";
      const folderDirectory = path.join(options.artifactRoot, safeSegment(request.folderId, "folder"));
      fs.mkdirSync(folderDirectory, { recursive: true });
      const baseName = safeSegment(request.node.config.artifactName || request.node.label, "workflow-output");
      const outputPath = path.join(folderDirectory, `${baseName}-${safeSegment(request.runId, "run")}.${extension}`);
      const resolvedData = readReferencedData(request.input.data);
      const content = typeof resolvedData === "string"
        ? resolvedData
        : JSON.stringify(resolvedData, null, format === "json" ? 2 : 2);
      if (!fs.existsSync(outputPath)) fs.writeFileSync(outputPath, content, "utf8");
      const folder = getFolderDetail(request.folderId);
      if (!folder?.materials.some((material) => material.content === outputPath)) {
        addMaterial(request.folderId, {
          type: "doc",
          name: path.basename(outputPath),
          content: outputPath,
        });
      }
      const output: WorkflowDataEnvelope = {
          version: 1,
          data: { saved: true, path: outputPath },
          artifacts: [{ name: path.basename(outputPath), mediaType: format === "markdown" ? "text/markdown" : format === "json" ? "application/json" : "text/plain", ref: outputPath }],
          meta: { idempotencyKey: request.idempotencyKey },
      };
      return {
        output,
        outputRef: outputPath,
      };
    },
  };
}
