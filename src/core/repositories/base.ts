// Repository 基类 · 共享的行 → 类型映射工具
// 所有 Repository 继承此类，避免重复样板代码

/**
 * 数据库行类型：所有字段都是 SQLite 原生类型（number / string / null）
 * boolean 在 SQLite 中存为 INTEGER（0/1）
 */
export type DbRow = Record<string, unknown>;

/**
 * 将 DB 行的 0/1 转为 boolean
 */
export function toBool(value: unknown): boolean {
  return value === 1 || value === true;
}

/**
 * 将 DB 行的 INTEGER nullable 转为 number | null
 */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

/**
 * 解析 DB 中 JSON 字符串字段
 */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
