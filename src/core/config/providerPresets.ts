import type { ModelProvider } from "./defaultConfig";

/**
 * OrcaRouter 的公开接入参数。
 *
 * OrcaRouter 提供 OpenAI Chat Completions 兼容接口，因此无需单独的
 * HTTP 客户端；这些常量用于设置页预填和仓库级 Provider 识别。
 */
export const ORCAROUTER_PROVIDER: ModelProvider = "orcarouter";
export const ORCAROUTER_BASE_URL = "https://api.orcarouter.ai/v1";
export const ORCAROUTER_DEFAULT_MODEL = "orcarouter/auto";
export const ORCAROUTER_API_KEY_ENV = "ORCAROUTER_API_KEY";

export const ORCAROUTER_PROVIDER_CONFIG = Object.freeze({
  provider: ORCAROUTER_PROVIDER,
  baseUrl: ORCAROUTER_BASE_URL,
  model: ORCAROUTER_DEFAULT_MODEL,
  apiKeyEnv: ORCAROUTER_API_KEY_ENV,
});
