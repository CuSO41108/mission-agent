// 配置文件读写 · YAML 格式
// 存储位置：userData/config.yaml（与 mission.db 同级）
// 零 electron 依赖：path 由 main 进程传入

import fs from "node:fs";
import path from "node:path";
// 注意：js-yaml 是 CJS 包，ESM 下必须用命名导入而非 default import
// 否则 Node 运行时报 "does not provide an export named 'default'"
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "./defaultConfig";

/**
 * 加载配置文件
 *
 * 行为：
 * - 文件存在：读取并解析 YAML，与 DEFAULT_CONFIG 深度合并（保证新增字段有默认值）
 * - 文件不存在：返回 DEFAULT_CONFIG（不写盘，由 main 决定是否首次创建）
 * - 解析失败：返回 DEFAULT_CONFIG，记录错误（不抛错，避免阻塞启动）
 *
 * @param configPath config.yaml 绝对路径，由 main 通过 app.getPath('userData') 拼接传入
 */
export function loadConfig(configPath: string): AppConfig {
  try {
    if (!fs.existsSync(configPath)) {
      return DEFAULT_CONFIG;
    }
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = yamlLoad(raw) as Partial<AppConfig>;
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (err) {
    console.error(
      `[config] loadConfig 失败，使用默认配置：`,
      err instanceof Error ? err.message : String(err),
    );
    return DEFAULT_CONFIG;
  }
}

/**
 * 保存配置到 YAML 文件
 *
 * 行为：
 * - 目录不存在则自动创建
 * - 写入失败抛错（让调用方处理，避免静默丢失配置）
 *
 * @param configPath config.yaml 绝对路径
 * @param config 完整配置对象
 */
export function saveConfig(configPath: string, config: AppConfig): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const yamlStr = yamlDump(config, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });
  fs.writeFileSync(configPath, yamlStr, "utf-8");
}

/**
 * 初始化配置文件（首次启动时调用）
 * 文件已存在则跳过，不覆盖用户配置
 */
export function initConfigFile(configPath: string): AppConfig {
  if (fs.existsSync(configPath)) {
    const config = loadConfig(configPath);
    try {
      const parsed = yamlLoad(fs.readFileSync(configPath, "utf-8"));
      if (
        parsed &&
        typeof parsed === "object" &&
        Object.prototype.hasOwnProperty.call(parsed, "integrations")
      ) {
        saveConfig(configPath, config);
        console.log(`[config] 已移除旧版接口凭据配置 ${configPath}`);
      }
    } catch {
      // loadConfig 已记录解析错误；避免用默认值覆盖无法解析的用户文件。
    }
    return config;
  }
  saveConfig(configPath, DEFAULT_CONFIG);
  console.log(`[config] 首次启动，已创建默认配置 ${configPath}`);
  return DEFAULT_CONFIG;
}
