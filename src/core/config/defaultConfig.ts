// 应用配置类型与默认值
// 对应 userData/config.yaml 的结构
// 零 electron 依赖，纯类型 + 常量

/**
 * DeepSeek API 配置
 * OpenAI 兼容协议，通过 openai npm 包或直接 fetch 调用
 */
export interface DeepSeekConfig {
  /** API key，形如 sk-xxx */
  apiKey: string;
  /** API base URL，默认官方地址 */
  baseUrl: string;
  /** 模型名，默认 deepseek-chat */
  model: string;
}

/**
 * Agent 心跳调度配置
 */
export interface AgentConfig {
  /** 心跳间隔（分钟），项目初期节流默认 30 */
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
 * 接口凭据配置（Phase 6/7 接入）
 */
export interface IntegrationsConfig {
  email: {
    provider: "gmail" | "outlook" | "imap" | "";
    address: string;
    /** IMAP 凭据或 OAuth token */
    imapHost: string;
    imapPort: number;
    imapUser: string;
    imapPass: string;
  };
  feishu: {
    appId: string;
    appSecret: string;
  };
}

/**
 * 完整应用配置
 */
export interface AppConfig {
  deepseek: DeepSeekConfig;
  agent: AgentConfig;
  system: SystemConfig;
  storage: StorageConfig;
  integrations: IntegrationsConfig;
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
  },
  agent: {
    heartbeatIntervalMin: 30,
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
  integrations: {
    email: {
      provider: "",
      address: "",
      imapHost: "",
      imapPort: 993,
      imapUser: "",
      imapPass: "",
    },
    feishu: {
      appId: "",
      appSecret: "",
    },
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
    agent: { ...base.agent, ...partial.agent },
    system: { ...base.system, ...partial.system },
    storage: { ...base.storage, ...partial.storage },
    integrations: {
      email: { ...base.integrations.email, ...partial.integrations?.email },
      feishu: { ...base.integrations.feishu, ...partial.integrations?.feishu },
    },
  };
}
