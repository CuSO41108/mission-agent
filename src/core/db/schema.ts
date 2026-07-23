// 数据库 Schema · 建表 SQL 定义
// 所有表均使用 CREATE TABLE IF NOT EXISTS，保证幂等可重复执行
// 字段类型对齐 src/renderer/types/index.ts 的类型定义

/**
 * schema_version 表：记录已执行的迁移版本
 * 每次启动时 migrate 会比对 SCHEMA_VERSION 常量
 * 若低于当前版本，则执行新增的建表语句
 */
export const SCHEMA_VERSION = 4;

export const CREATE_SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
`;

/**
 * 任务舱表
 * 对应类型：TaskFolder
 */
export const CREATE_FOLDERS_TABLE = `
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  priority TEXT CHECK(priority IN ('critical','high','medium','low')),
  status TEXT CHECK(status IN ('active','paused','done','archived')),
  deadline INTEGER,
  progress INTEGER DEFAULT 0,
  cover_color TEXT,
  source_integration TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
`;

/**
 * 待办表（支持父子嵌套）
 * 对应类型：Todo（subtasks 字段在数据库中通过 parent_id 自关联表达）
 */
export const CREATE_TODOS_TABLE = `
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  due_date INTEGER,
  assignee TEXT CHECK(assignee IN ('human','agent')),
  source TEXT,
  agent_task_type TEXT DEFAULT 'analysis',
  artifact_format TEXT DEFAULT 'markdown',
  workflow_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_todos_folder ON todos(folder_id);
CREATE INDEX IF NOT EXISTS idx_todos_parent ON todos(parent_id);
`;

/**
 * 材料引用表（默认引用原路径，归档后复制到仓库目录）
 * 对应类型：Material
 */
export const CREATE_MATERIALS_TABLE = `
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  type TEXT,
  name TEXT,
  content TEXT,
  storage_mode TEXT DEFAULT 'ref',
  original_path TEXT,
  archived_path TEXT,
  source_integration TEXT,
  added_at INTEGER,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_materials_folder ON materials(folder_id);
`;

/**
 * 时间线表
 * 对应类型：TimelineEntry
 */
export const CREATE_TIMELINE_TABLE = `
CREATE TABLE IF NOT EXISTS timeline (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  actor TEXT CHECK(actor IN ('human','agent','system')),
  action TEXT,
  meta TEXT,
  timestamp INTEGER,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_timeline_folder ON timeline(folder_id);
`;

/**
 * Agent 配置表（每个任务舱一条）
 * 对应类型：AgentConfig（permissions 字段 JSON 序列化存储）
 */
export const CREATE_AGENT_CONFIGS_TABLE = `
CREATE TABLE IF NOT EXISTS agent_configs (
  folder_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  strategy TEXT,
  permissions TEXT,
  workflow_id TEXT,
  last_action INTEGER,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
`;

/**
 * 接口适配器表
 * 对应类型：IntegrationAdapter（config 字段 JSON 序列化存储）
 */
export const CREATE_INTEGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  type TEXT,
  name TEXT,
  description TEXT,
  status TEXT,
  last_sync INTEGER,
  events_today INTEGER DEFAULT 0,
  config TEXT
);
`;

/**
 * 工作流规则表
 * 对应类型：WorkflowRule（trigger/conditions/actions 字段 JSON 序列化存储）
 */
export const CREATE_WORKFLOWS_TABLE = `
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT,
  enabled INTEGER DEFAULT 1,
  trigger TEXT,
  conditions TEXT,
  actions TEXT,
  layout TEXT,
  runs INTEGER DEFAULT 0,
  last_run INTEGER,
  last_status TEXT,
  last_error TEXT
);
`;

export const CREATE_WORKFLOW_RUNS_TABLE = `
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  folder_id TEXT,
  message TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  FOREIGN KEY(workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, started_at DESC);
`;

/**
 * 同步日志表（接口拉取/推送记录）
 */
export const CREATE_SYNC_LOG_TABLE = `
CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  integration_id TEXT,
  direction TEXT,
  type TEXT,
  message TEXT,
  payload TEXT,
  timestamp INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sync_log_int ON sync_log(integration_id);
`;

/**
 * 所有建表语句的有序列表
 * migrate 会按顺序执行
 */
export const ALL_SCHEMA_SQL: string[] = [
  CREATE_SCHEMA_VERSION_TABLE,
  CREATE_FOLDERS_TABLE,
  CREATE_TODOS_TABLE,
  CREATE_MATERIALS_TABLE,
  CREATE_TIMELINE_TABLE,
  CREATE_AGENT_CONFIGS_TABLE,
  CREATE_INTEGRATIONS_TABLE,
  CREATE_WORKFLOWS_TABLE,
  CREATE_WORKFLOW_RUNS_TABLE,
  CREATE_SYNC_LOG_TABLE,
];
