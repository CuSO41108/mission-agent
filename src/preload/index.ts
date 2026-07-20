/**
 * Mission Console · Preload 脚本
 * 通过 contextBridge 暴露白名单 API 给渲染进程
 * 渲染进程只能通过 window.missionConsole.xxx() 调用，无法直接访问 Node
 *
 * 类型导出：export type MissionConsoleApi
 * 渲染器通过 import type 复用，类型零重复
 */
import { contextBridge, ipcRenderer } from "electron";

// 用 import type 引入业务类型，preload 不在运行时依赖 renderer
import type {
  TaskFolder,
  IntegrationAdapter,
  WorkflowRule,
  Material,
  CreateFolderInput,
  CreateTodoInput,
  UpdateAgentConfigInput,
  UpsertIntegrationInput,
  FolderStatus,
} from "../renderer/types";
import type { AppConfig } from "../core/config";

const api = {
  // ============ 应用信息 ============
  getVersion: () => ipcRenderer.invoke("app:version") as Promise<string>,
  getPlatform: () => ipcRenderer.invoke("app:platform") as Promise<string>,

  // ============ 设置（旧 API，保留兼容） ============
  getSetting: (key: string) => ipcRenderer.invoke("settings:get", key) as Promise<unknown>,
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke("settings:set", key, value) as Promise<boolean>,

  // ============ 配置（Phase 4） ============
  getConfig: () => ipcRenderer.invoke("config:get") as Promise<AppConfig>,
  setConfig: (partial: Partial<AppConfig>) =>
    ipcRenderer.invoke("config:set", partial) as Promise<AppConfig>,
  testDeepSeek: () =>
    ipcRenderer.invoke("deepseek:test") as Promise<
      | { ok: true; content: string; model: string }
      | { ok: false; error: string }
    >,

  // ============ 数据读取（Phase 3） ============
  getFolders: () => ipcRenderer.invoke("folder:list") as Promise<TaskFolder[]>,
  getFolder: (id: string) => ipcRenderer.invoke("folder:get", id) as Promise<TaskFolder | null>,
  createFolder: (input: CreateFolderInput) =>
    ipcRenderer.invoke("folder:create", input) as Promise<TaskFolder>,
  deleteFolder: (folderId: string) =>
    ipcRenderer.invoke("folder:delete", folderId) as Promise<boolean>,
  getIntegrations: () => ipcRenderer.invoke("integration:list") as Promise<IntegrationAdapter[]>,
  createIntegration: (input: UpsertIntegrationInput) =>
    ipcRenderer.invoke("integration:create", input) as Promise<IntegrationAdapter>,
  updateIntegration: (id: string, input: UpsertIntegrationInput) =>
    ipcRenderer.invoke("integration:update", id, input) as Promise<IntegrationAdapter>,
  deleteIntegration: (id: string) =>
    ipcRenderer.invoke("integration:delete", id) as Promise<boolean>,
  getWorkflows: () => ipcRenderer.invoke("workflow:list") as Promise<WorkflowRule[]>,

  // ============ 写操作（Phase 5） ============
  // folder 状态变更
  setFolderStatus: (folderId: string, status: FolderStatus) =>
    ipcRenderer.invoke("folder:updateStatus", folderId, status) as Promise<TaskFolder | null>,
  // todo 切换完成状态
  createTodo: (folderId: string, input: CreateTodoInput) =>
    ipcRenderer.invoke("todo:create", folderId, input) as Promise<TaskFolder>,
  toggleTodo: (folderId: string, todoId: string, done: boolean) =>
    ipcRenderer.invoke("todo:toggle", folderId, todoId, done) as Promise<TaskFolder>,
  // 添加材料
  addMaterial: (
    folderId: string,
    material: Omit<Material, "id" | "folderId" | "addedAt">,
  ) => ipcRenderer.invoke("material:add", folderId, material) as Promise<Material>,
  deleteMaterial: (folderId: string, materialId: string) =>
    ipcRenderer.invoke("material:delete", folderId, materialId) as Promise<boolean>,
  pickMaterialFile: () =>
    ipcRenderer.invoke("file:pickMaterial") as Promise<{ path: string; name: string } | null>,
  openMaterial: (folderId: string, materialId: string) =>
    ipcRenderer.invoke("material:open", folderId, materialId) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  // Agent 开关
  toggleAgent: (folderId: string, enabled: boolean) =>
    ipcRenderer.invoke("agent:toggle", folderId, enabled) as Promise<boolean>,
  updateAgentConfig: (folderId: string, input: UpdateAgentConfigInput) =>
    ipcRenderer.invoke("agent:updateConfig", folderId, input) as Promise<TaskFolder>,
  // Workflow 开关
  toggleWorkflow: (workflowId: string, enabled: boolean) =>
    ipcRenderer.invoke("workflow:toggle", workflowId, enabled) as Promise<boolean>,

  // ============ 心跳（Phase 5） ============
  // 手动触发一次心跳巡检所有 enabled 舱体
  triggerHeartbeat: () =>
    ipcRenderer.invoke("agent:triggerHeartbeat") as Promise<
      | { ok: true; scanned: number; executed: number; succeeded: number; failed: number }
      | { ok: false; error: string }
    >,
  // 手动触发单个舱体的 Agent
  runAgentOnce: (folderId: string) =>
    ipcRenderer.invoke("agent:runOnce", folderId) as Promise<
      | { ok: true; summary: string }
      | { ok: false; error: string }
    >,
  getSchedulerStatus: () =>
    ipcRenderer.invoke("agent:schedulerStatus") as Promise<{
      scheduled: boolean;
      running: boolean;
      state: "idle" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled";
      intervalMin: number;
      activeRunId: string | null;
      activeRunStartedAt: number | null;
      lastRunFinishedAt: number | null;
      lastError: string | null;
      nextRunAt: number | null;
    }>,

  // ============ Agent 事件订阅（主进程主动推送） ============
  /**
   * 订阅 Agent 推送的事件（心跳开始/完成、错误等）
   * 返回 unsubscribe 函数，useEffect 里直接 return 即可自动清理
   */
  onAgentEvent: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on("agent:event", listener);
    return () => ipcRenderer.removeListener("agent:event", listener);
  },
};

// 关键：导出类型给渲染器复用，实现类型零重复
export type MissionConsoleApi = typeof api;

contextBridge.exposeInMainWorld("missionConsole", api);
