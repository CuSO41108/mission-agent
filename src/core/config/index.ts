// 配置层统一出口
export {
  DEFAULT_CONFIG,
  DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
  MIN_HEARTBEAT_INTERVAL_MINUTES,
  MAX_HEARTBEAT_INTERVAL_MINUTES,
  normalizeHeartbeatIntervalMin,
  mergeConfig,
  type AppConfig,
  type DeepSeekConfig,
  type AgentConfig,
  type SystemConfig,
  type StorageConfig,
  type IntegrationsConfig,
} from "./defaultConfig";
export { loadConfig, saveConfig, initConfigFile } from "./configLoader";
export {
  chat,
  testDeepSeek,
  type ChatMessage,
  type ChatResult,
  type ChatOptions,
} from "./deepseekClient";
