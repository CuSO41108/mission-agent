# 路线图 · Mission Console

> 本文档记录每个 Phase 的子任务拆分与状态，便于跨会话进度对齐。
> 主文档：[TechnicalArchitecture.md](./TechnicalArchitecture.md) · [PRD.md](./PRD.md)

## 总览

| Phase | 主题 | 状态 |
|-------|------|------|
| Phase 0 | 前端 UI 壳 | ✅ 完成 |
| Phase 1 | Electron 工程化（四段式目录 + 主进程 + preload + 启动器） | ✅ 完成 |
| Phase 2 | SQLite 数据层（node:sqlite + Schema + Seed + 7 Repository） | ✅ 完成 |
| Phase 3 | IPC 数据联通（读链路：folder/integration/workflow 从 SQLite 到 UI） | ✅ 完成 |
| Phase 4 | 设置页 + config.yaml + DeepSeek API key 配置 | ✅ 完成 |
| Phase 5 | 心跳调度 + Agent worker（调 DeepSeek） + 写操作 IPC | ✅ 完成 |
| Phase 6 | 邮件接口（IMAP）"邮件→任务舱"闭环 | ⏳ |
| Phase 7 | 飞书接口接入 | ⏳ |
| Phase 8 | 文件引用 + 归档机制 + 写操作补全 | ⏳ |
| Phase 9 | 打包与 npm 全局命令发布 | ⏳ |

---

## Phase 4 · 设置页 + config.yaml + DeepSeek API key

**目标**：用户能在设置页配置 DeepSeek API key、仓库目录、心跳间隔、开机自启；配置落盘到 `userData/config.yaml`，重启不丢；DeepSeek 连接测试按钮真实发请求验证 key 有效。

| 步骤 | 模块 | 产出 | 状态 |
|------|------|------|------|
| S1 | `package.json` | 安装 `js-yaml` + `@types/js-yaml` | ⏳ |
| S2 | `src/core/config/defaultConfig.ts` | 默认配置常量 + AppConfig 类型 | ⏳ |
| S3 | `src/core/config/configLoader.ts` | `loadConfig(path)` / `saveConfig(path, config)` YAML 读写 | ⏳ |
| S4 | `src/core/config/deepseekClient.ts` | DeepSeek 客户端封装（基于 fetch，OpenAI 兼容协议） | ⏳ |
| S5 | `src/main/index.ts` | 启动时加载 config，不存在则创建默认；IPC handler: `config:get` / `config:set` / `deepseek:test` | ⏳ |
| S6 | `src/preload/index.ts` | 加 `getConfig()` / `setConfig(partial)` / `testDeepSeek()` | ⏳ |
| S7 | `src/renderer/pages/Settings.tsx` | 设置页面 UI（5 个分区）+ 路由 | ⏳ |
| S8 | 验证 | typecheck + build + 设置页能改配置 + DeepSeek 测试按钮可用 | ⏳ |

**设置页 5 个分区**：
1. DeepSeek 配置：API key 输入 + 模型选择 + 连接测试按钮
2. 仓库目录：文件选择器（默认 `~/Documents/MissionVault`）
3. 心跳调度：间隔分钟数滑块 + 全局开关 + 立即触发按钮
4. 系统选项：开机自启开关 + 全局快捷键输入 + 托盘图标开关
5. 接口凭据：邮件 / 飞书 / 企业微信凭据占位（实际接入留到 Phase 6/7）

**关键设计**：
- config.yaml 存在 `userData/`，与 `mission.db` 同级
- main 进程启动时读 config，注入到内存（全局单例）
- IPC `config:get` 返回完整 config（API key 可考虑后续加密）
- IPC `config:set` 接收 partial，merge 后写回 YAML
- DeepSeek 测试：发 `POST /chat/completions` 最小请求（"ping" → 期望返回任意 completion）

---

## Phase 5 · 心跳调度 + Agent worker + 写操作 IPC

**目标**：让 Agent 真的跑起来。心跳 30min 一次，调 DeepSeek 决策；同时补齐 Phase 3 没做的写操作 IPC，让 UI 点击持久化。

| 步骤 | 模块 | 产出 |
|------|------|------|
| S1 | `src/core/workflow/WorkflowService.ts` | `tick()` 心跳主逻辑：扫 enabled 舱体 → 检查 deadline → 调 Agent |
| S2 | `src/core/agent/AgentService.ts` | 单舱 Agent：构造 prompt → 调 DeepSeek → 解析响应 → 写 timeline |
| S3 | `src/main/scheduler.ts` | node-cron 定时器注册，委托 WorkflowService.tick |
| S4 | `src/main/index.ts` | 补写 IPC：folder:updateStatus / todo:toggle / material:add / agent:toggle / workflow:toggle |
| S5 | `src/preload/index.ts` + store | 加写 API + store 方法改成调 IPC + 拿返回值刷新 |
| S6 | Agent 事件推送 | tick 完成后 `webContents.send("agent:event", ...)` 通知 UI |
| S7 | 验证 | 心跳触发 + UI 按钮持久化 + DeepSeek 真实返回 |

**写操作清单**（Phase 3.5 补齐）：
- `folder:updateStatus(id, status)` — 归档/暂停/恢复
- `todo:toggle(id, done)` — 勾选待办
- `material:add(folderId, material)` — 添加材料
- `agent:toggleEnabled(folderId, enabled)` — 开关 Agent
- `workflow:toggleEnabled(id, enabled)` — 开关工作流

---

## Phase 6 · 邮件接口（IMAP）

**目标**：跑通"邮件→任务舱"闭环。心跳时拉新邮件，匹配工作流规则，自动入舱或追加材料。

| 步骤 | 模块 | 产出 |
|------|------|------|
| S1 | `src/core/integrations/emailAdapter.ts` | imapflow 实现 `fetch()` / `send()` |
| S2 | `src/core/integrations/adapter.ts` | `IntegrationAdapter` 统一契约接口 |
| S3 | `src/core/workflow/ruleMatcher.ts` | 规则匹配引擎：邮件 → 命中规则 → 生成动作 |
| S4 | WorkflowService 接入 | tick() 中调 EmailAdapter.fetch → 规则匹配 → 入舱/追加材料 |
| S5 | 设置页接邮件凭据 | IMAP 配置（host/port/user/pass）+ OAuth（可选） |
| S6 | 验证 | 真实 Gmail/Outlook 账号接入，邮件能入舱 |

---

## Phase 7 · 飞书接口接入

**目标**：飞书群消息 @你 → 自动生成待办或追加至舱体。

| 步骤 | 模块 | 产出 |
|------|------|------|
| S1 | `src/core/integrations/feishuAdapter.ts` | 飞书 SDK 实现 |
| S2 | 事件订阅 | 长连接接收飞书事件（消息/文档更新） |
| S3 | 规则映射 | 飞书事件 → IntegrationAdapter 统一事件 |
| S4 | 设置页接飞书凭据 | AppID / App Secret 配置 |
| S5 | 验证 | 飞书群 @你 → 任务舱追加待办 |

---

## Phase 8 · 文件引用 + 归档机制 + 写操作补全

**目标**：拖文件进舱体 → 默认引用原路径；右键"归档"→ 复制到仓库目录。

| 步骤 | 模块 | 产出 |
|------|------|------|
| S1 | `src/core/files/fileRefService.ts` | 引用模式：记录 original_path，不复制 |
| S2 | `src/core/files/archiveService.ts` | 归档模式：复制到 vault_dir，更新 archived_path |
| S3 | IPC + preload | `file:open` / `file:archive` / `file:chooseFolder` |
| S4 | UI 接入 | 材料库拖拽上传 + 右键菜单 + 文件选择器 |
| S5 | 验证 | 拖文件 → 引用；右键归档 → 复制到仓库目录 |

---

## Phase 9 · 打包与 npm 全局命令发布

**目标**：`npm install -g .` 后终端 `mission-console` 启动；README 完善使用说明。

| 步骤 | 模块 | 产出 |
|------|------|------|
| S1 | `bin/mission-console.cjs` | 完善启动器错误处理 + 路径检测 |
| S2 | `README.md` | 完整使用说明：环境要求（Node ≥ 22.13）、安装、启动、配置 |
| S3 | `package.json` | 校验 `files` 字段、`prepare` 钩子、版本号 |
| S4 | 端到端测试 | 全新机器 `npm install -g .` → `mission-console` 启动正常 |

---

## 进度同步规则

- 每个 Phase 完成后，更新本文件对应行的状态（⏳ → 🚧 → ✅）
- 每个 Phase 的子步骤完成后，更新表格状态
- Phase 完成后建议 git commit（按 Phase 颗粒度）
- 下次会话开始时，先读本文件定位进度
