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
} from "../renderer/types";

const api = {
  // ============ 应用信息 ============
  getVersion: () => ipcRenderer.invoke("app:version") as Promise<string>,
  getPlatform: () => ipcRenderer.invoke("app:platform") as Promise<string>,

  // ============ 设置 ============
  getSetting: (key: string) => ipcRenderer.invoke("settings:get", key) as Promise<unknown>,
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke("settings:set", key, value) as Promise<boolean>,

  // ============ 数据读取 ============
  // Phase 3：只接读操作，写操作留到后续 Phase
  getFolders: () => ipcRenderer.invoke("folder:list") as Promise<TaskFolder[]>,
  getFolder: (id: string) => ipcRenderer.invoke("folder:get", id) as Promise<TaskFolder | null>,
  getIntegrations: () => ipcRenderer.invoke("integration:list") as Promise<IntegrationAdapter[]>,
  getWorkflows: () => ipcRenderer.invoke("workflow:list") as Promise<WorkflowRule[]>,

  // ============ Agent 事件订阅（主进程主动推送） ============
  /**
   * 订阅 Agent 推送的事件（心跳完成、邮件入舱、催办等）
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
