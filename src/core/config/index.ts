// 配置层统一出口
export {
  DEFAULT_CONFIG,
  mergeConfig,
  type AppConfig,
  type DeepSeekConfig,
  type AgentConfig,
  type SystemConfig,
  type StorageConfig,
  type IntegrationsConfig,
} from "./defaultConfig";
export { loadConfig, saveConfig, initConfigFile } from "./configLoader";
export { chat, testDeepSeek, type ChatMessage, type ChatResult } from "./deepseekClient";
