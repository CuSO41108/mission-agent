// 数据库客户端单例 · node:sqlite 封装
// 零 electron 依赖：dbPath 由 main 进程显式传入（字符串参数）
// 这样 src/core/ 整个目录未来可被 Web 版服务端直接复用

import { DatabaseSync } from "node:sqlite";

/**
 * 全局数据库实例（initDatabase 后才有值）
 * 模块级单例：同一进程内共享同一个连接
 */
let db: DatabaseSync | null = null;

/**
 * 当前数据库文件路径（用于错误提示与日志）
 */
let currentDbPath: string | null = null;

export interface InitDatabaseOptions {
  /** 数据库文件绝对路径，由 main 进程通过 app.getPath('userData') 拼接传入 */
  dbPath: string;
  /**
   * 初始化后是否执行 seed（首次启动时为 true，后续启动为 false）
   * 由 main 进程判断"数据库文件是否存在"后传入
   */
  seed?: boolean;
}

/**
 * 初始化数据库连接
 *
 * 调用时机：main 进程 app.whenReady() 之后立即调用
 * 重复调用：会抛错，避免意外重置连接
 *
 * 注意：此函数只负责"打开连接 + 跑 migrate"，不负责 seed
 * seed 由 main 进程显式调 seedDatabase() 完成
 */
export function initDatabase(options: InitDatabaseOptions): DatabaseSync {
  if (db) {
    throw new Error(
      `[db] initDatabase 不可重复调用，当前已连接到 ${currentDbPath}`,
    );
  }

  try {
    // node:sqlite DatabaseSync 构造函数直接接受文件路径
    // 文件不存在时会自动创建（SQLite 标准行为）
    db = new DatabaseSync(options.dbPath);
    currentDbPath = options.dbPath;

    // 开启 WAL 模式：并发读 + 单写，提升性能
    // journal_mode=WAL 是 SQLite 的标准 pragma，重启后仍生效
    db.exec("PRAGMA journal_mode = WAL;");

    // 开启外键约束：让 ON DELETE CASCADE 真正生效
    // SQLite 默认关闭外键，必须每次连接显式开启
    db.exec("PRAGMA foreign_keys = ON;");

    return db;
  } catch (err) {
    db = null;
    currentDbPath = null;
    throw new Error(
      `[db] initDatabase 失败，路径 ${options.dbPath}：${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * 获取已初始化的数据库实例
 * 在 initDatabase 之前调用会抛错
 */
export function getDb(): DatabaseSync {
  if (!db) {
    throw new Error(
      "[db] getDb 在 initDatabase 之前调用，请检查启动顺序",
    );
  }
  return db;
}

/**
 * 关闭数据库连接
 * 调用时机：app.beforeQuit 事件
 * 关闭后 getDb 会抛错，避免泄漏连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    currentDbPath = null;
  }
}

/**
 * 返回当前数据库文件路径（调试与日志用）
 */
export function getDbPath(): string | null {
  return currentDbPath;
}
