// DeepSeek 客户端 · OpenAI 兼容协议
// 用 fetch 直调，不依赖 openai npm 包（减少打包体积）
// 零 electron 依赖，未来 Web 版可复用

import type { DeepSeekConfig } from "./defaultConfig";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * 测试 DeepSeek API 连接
 * 发一个最小请求验证 key 是否有效
 *
 * @returns 成功返回模型回复内容，失败抛 Error
 */
export async function testDeepSeek(config: DeepSeekConfig): Promise<ChatResult> {
  if (!config.apiKey) {
    throw new Error("API key 为空，请先在设置页配置");
  }

  return chat(config, [
    { role: "user", content: "ping" },
  ]);
}

/**
 * 调用 DeepSeek Chat API（OpenAI 兼容协议）
 *
 * @param config DeepSeek 配置（apiKey + baseUrl + model）
 * @param messages 消息列表
 * @returns ChatResult，失败抛 Error（含状态码与响应体）
 */
export async function chat(
  config: DeepSeekConfig,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let timedOut = false;
  const onExternalAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    controller.abort(options.signal.reason);
  } else {
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`DeepSeek 请求超过 ${timeoutMs}ms`));
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        max_tokens: options.maxTokens ?? 1024,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new Error(`DeepSeek 请求超时（${timeoutMs}ms）`);
    }
    if (options.signal?.aborted) {
      throw new Error("DeepSeek 请求已取消");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `DeepSeek API 返回 ${response.status}：${errorBody.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    choices: Array<{
      message: { role: string; content: string };
    }>;
    model: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };

  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error("DeepSeek API 返回为空（choices 数组为空）");
  }

  return {
    content: choice.message.content,
    model: data.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}
