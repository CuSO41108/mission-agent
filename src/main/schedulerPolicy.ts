import {
  normalizeHeartbeatIntervalMin,
  type AppConfig,
  type DeepSeekConfig,
} from "../core/config/defaultConfig.ts";

export const HEARTBEAT_RUN_TIMEOUT_MS = 10 * 60 * 1000;
export const DEEPSEEK_REQUEST_TIMEOUT_MS = 60 * 1000;

export interface HeartbeatConfigSnapshot {
  enabled: boolean;
  intervalMin: number;
  deepseek: DeepSeekConfig;
}

/**
 * 每次执行前读取最新配置，并复制本轮需要的字段。
 * 配置在一轮执行期间保持稳定，下一轮会自动看到设置页的最新值。
 */
export function readHeartbeatConfig(
  getConfig: () => AppConfig,
): HeartbeatConfigSnapshot {
  const config = getConfig();
  return {
    enabled: config.agent.enabled,
    intervalMin: normalizeHeartbeatIntervalMin(config.agent.heartbeatIntervalMin),
    deepseek: { ...config.deepseek },
  };
}

export function heartbeatDelayMs(intervalMin: number): number {
  return normalizeHeartbeatIntervalMin(intervalMin) * 60 * 1000;
}
