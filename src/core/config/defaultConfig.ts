// 应用配置类型与默认值
// 对应 userData/config.yaml 的结构
// 零 electron 依赖，纯类型 + 常量

/**
 * OpenAI 兼容模型 API 配置。字段名保留 deepseek 以兼容已有 config.yaml。
 * OpenAI 兼容协议，通过 openai npm 包或直接 fetch 调用
 */
export interface DeepSeekConfig {
  /** API key，形如 sk-xxx */
  apiKey: string;
  /** API base URL，默认官方地址 */
  baseUrl: string;
  /** 模型名，默认 deepseek-chat */
  model: string;
  /** 仅供设置页显示；真实 key 永远不返回渲染进程。 */
  apiKeyConfigured?: boolean;
}

/**
 * Agent 心跳调度配置
 */
export interface AgentConfig {
  /** 心跳间隔（分钟），默认 60，允许在设置页调整 */
  heartbeatIntervalMin: number;
  /** 全局开关，关闭后所有心跳停止 */
  enabled: boolean;
}

/**
 * 系统配置
 */
export interface SystemConfig {
  /** 开机自启（默认关闭） */
  autoLaunch: boolean;
  /** 托盘图标（默认开启） */
  trayIcon: boolean;
  /** 全局快捷键 */
  globalShortcut: string;
}

/**
 * 文件存储配置
 */
export interface StorageConfig {
  /** 仓库目录，归档模式文件存放处 */
  vaultDir: string;
}

/**
 * 完整应用配置
 */
export interface AppConfig {
  deepseek: DeepSeekConfig;
  agent: AgentConfig;
  system: SystemConfig;
  storage: StorageConfig;
}

/** 心跳默认每 60 分钟运行，允许用户在 5 分钟到 24 小时之间调整。 */
export const DEFAULT_HEARTBEAT_INTERVAL_MINUTES = 60;
export const MIN_HEARTBEAT_INTERVAL_MINUTES = 5;
export const MAX_HEARTBEAT_INTERVAL_MINUTES = 24 * 60;

export function normalizeHeartbeatIntervalMin(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HEARTBEAT_INTERVAL_MINUTES;
  return Math.max(
    MIN_HEARTBEAT_INTERVAL_MINUTES,
    Math.min(MAX_HEARTBEAT_INTERVAL_MINUTES, Math.round(value)),
  );
}

/**
 * 默认配置
 * 首次启动时写入 userData/config.yaml
 */
export const DEFAULT_CONFIG: AppConfig = {
  deepseek: {
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKeyConfigured: false,
  },
  agent: {
    heartbeatIntervalMin: DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
    enabled: true,
  },
  system: {
    autoLaunch: false,
    trayIcon: true,
    // Windows 默认 Ctrl+Alt+Space，macOS 用 Option+Space
    globalShortcut: process.platform === "darwin" ? "Option+Space" : "Ctrl+Alt+Space",
  },
  storage: {
    // 默认仓库目录：用户文档下 MissionVault
    // 用户应该在设置页改成自己的路径
    vaultDir: "",
  },
};

/**
 * 深度合并：把 partial 配置 merge 到 base 上
 * - 数组直接替换
 * - 对象递归合并
 * - 基本类型直接覆盖
 *
 * 用途：IPC config:set 接收 partial，merge 到当前 config 后写回
 */
export function mergeConfig(base: AppConfig, partial: Partial<AppConfig>): AppConfig {
  return {
    deepseek: { ...base.deepseek, ...partial.deepseek },
    agent: {
      ...base.agent,
      ...partial.agent,
      heartbeatIntervalMin: normalizeHeartbeatIntervalMin(
        partial.agent?.heartbeatIntervalMin ?? base.agent.heartbeatIntervalMin,
      ),
    },
    system: { ...base.system, ...partial.system },
    storage: { ...base.storage, ...partial.storage },
  };
}
