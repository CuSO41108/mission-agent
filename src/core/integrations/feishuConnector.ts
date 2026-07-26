import { createHmac } from "node:crypto";
import type { IntegrationAdapter, IntegrationTarget, WorkflowDataEnvelope } from "../../renderer/types";
import { IntegrationRepository } from "../repositories/integrationRepository";
import { getIntegrationSecrets, setIntegrationStatus } from "../services/integrationService";

const FEISHU_BASE_URL = "https://open.feishu.cn/open-apis";
const MAX_MESSAGE_LENGTH = 20_000;

interface FeishuEnvelope {
  code?: number;
  msg?: string;
  StatusCode?: number;
  StatusMessage?: string;
  tenant_access_token?: string;
  data?: {
    items?: Array<{ chat_id?: string; name?: string }>;
    page_token?: string;
    has_more?: boolean;
    message_id?: string;
  };
}

export class UncertainIntegrationStateError extends Error {}

async function jsonRequest(
  url: string,
  init: RequestInit,
  options: { sideEffect?: boolean; idempotent?: boolean } = {},
): Promise<FeishuEnvelope> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (options.idempotent && attempt < 2) continue;
      if (options.sideEffect) {
        throw new UncertainIntegrationStateError(`飞书请求中断，无法确认消息是否已发送：${error instanceof Error ? error.message : String(error)}`);
      }
      throw new Error(`飞书连接失败：${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status >= 500 && options.idempotent && attempt < 2) continue;
    break;
  }
  if (!response) throw new Error("飞书连接失败");
  const text = await response.text();
  let body: FeishuEnvelope;
  try {
    body = text ? JSON.parse(text) as FeishuEnvelope : {};
  } catch {
    throw new Error(`飞书返回了无法识别的响应（HTTP ${response.status}）`);
  }
  const businessCode = typeof body.code === "number" ? body.code : body.StatusCode;
  if (!response.ok || (typeof businessCode === "number" && businessCode !== 0)) {
    throw new Error(`飞书接口失败（HTTP ${response.status} / ${businessCode ?? "unknown"}）：${body.msg || body.StatusMessage || "未知错误"}`);
  }
  return body;
}

async function tenantToken(adapter: IntegrationAdapter): Promise<string> {
  const secrets = getIntegrationSecrets(adapter.id);
  if (!secrets.clientId || !secrets.clientSecret) throw new Error("飞书自建应用缺少 App ID 或 App Secret");
  const response = await jsonRequest(`${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: secrets.clientId, app_secret: secrets.clientSecret }),
  }, { idempotent: true });
  if (!response.tenant_access_token) throw new Error("飞书未返回 tenant access token");
  return response.tenant_access_token;
}

export async function listFeishuTargets(integrationId: string): Promise<IntegrationTarget[]> {
  const adapter = IntegrationRepository.findById(integrationId);
  if (!adapter) throw new Error("适配器不存在");
  if (adapter.config.mode === "feishu_webhook") {
    return adapter.config.targets.length
      ? adapter.config.targets
      : [{ id: "webhook", name: adapter.name || "飞书群机器人", kind: "webhook" }];
  }
  if (adapter.config.mode !== "feishu_app") throw new Error("该适配器不是飞书连接器");
  const token = await tenantToken(adapter);
  const targets: IntegrationTarget[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const response = await jsonRequest(`${FEISHU_BASE_URL}/im/v1/chats?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, { idempotent: true });
    for (const item of response.data?.items ?? []) {
      if (item.chat_id && item.name) targets.push({ id: item.chat_id, name: item.name, kind: "chat" });
    }
    pageToken = response.data?.has_more ? response.data.page_token ?? "" : "";
  } while (pageToken && targets.length < 500);
  return targets;
}

function webhookSignature(secret: string, timestamp: string): string {
  return createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
}

async function sendFeishuTextInternal(input: {
  integrationId: string;
  targetId: string;
  text: string;
  idempotencyKey: string;
}, requireVerified: boolean): Promise<{ messageId: string | null }> {
  const adapter = IntegrationRepository.findById(input.integrationId);
  if (!adapter) throw new Error("飞书适配器不存在或已删除");
  if (requireVerified && adapter.status !== "connected") throw new Error("飞书适配器尚未通过连接测试");
  const target = adapter.config.targets.find((item) => item.id === input.targetId);
  if (!target) throw new Error("目标群未在适配器授权列表中");
  const text = input.text.trim();
  if (!text) throw new Error("飞书消息不能为空");
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`飞书消息超过 ${MAX_MESSAGE_LENGTH} 字符限制`);
  const secrets = getIntegrationSecrets(adapter.id);

  if (adapter.config.mode === "feishu_webhook") {
    if (!secrets.webhookUrl) throw new Error("飞书群机器人缺少 Webhook URL");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload: Record<string, unknown> = { msg_type: "text", content: { text } };
    if (secrets.token) {
      payload.timestamp = timestamp;
      payload.sign = webhookSignature(secrets.token, timestamp);
    }
    await jsonRequest(secrets.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { sideEffect: true, idempotent: false });
    IntegrationRepository.recordSuccessfulEvent(adapter.id);
    return { messageId: null };
  }

  if (adapter.config.mode !== "feishu_app") throw new Error("该适配器不是飞书连接器");
  const token = await tenantToken(adapter);
  const query = new URLSearchParams({
    receive_id_type: "chat_id",
    uuid: input.idempotencyKey.slice(0, 50),
  });
  const response = await jsonRequest(`${FEISHU_BASE_URL}/im/v1/messages?${query.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      receive_id: target.id,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  }, { sideEffect: true, idempotent: true });
  IntegrationRepository.recordSuccessfulEvent(adapter.id);
  return { messageId: response.data?.message_id ?? null };
}

export async function sendFeishuText(input: {
  integrationId: string;
  targetId: string;
  text: string;
  idempotencyKey: string;
}): Promise<{ messageId: string | null }> {
  return sendFeishuTextInternal(input, true);
}

export async function testFeishuConnection(integrationId: string, targetId: string): Promise<void> {
  try {
    // 测试消息必须由设置界面显式确认后调用；保存配置不会经过这里。
    const adapter = IntegrationRepository.findById(integrationId);
    if (!adapter) throw new Error("适配器不存在");
    await sendFeishuTextInternal({
      integrationId,
      targetId,
      text: "Mission Console 连接测试，可安全忽略。",
      idempotencyKey: `test-${Date.now()}`,
    }, false);
  } catch (error) {
    setIntegrationStatus(integrationId, "error");
    throw error;
  }
}

function valueAtPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const part of path.split(".")) {
    if (!part || current === null || typeof current !== "object" || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function renderIntegrationTemplate(template: string, envelope: WorkflowDataEnvelope): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_match, path: string) => {
    const value = valueAtPath(envelope, path);
    if (value === undefined || value === null) throw new Error(`飞书消息变量“${path}”没有可用值`);
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}
