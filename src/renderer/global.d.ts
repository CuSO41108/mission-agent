/**
 * Mission Console · 全局类型声明
 * 让渲染进程能通过 window.missionConsole.xxx() 调用 preload 暴露的 API
 * 类型从 preload 导入，零重复
 */
import type { MissionConsoleApi } from "../../preload";

declare global {
  interface Window {
    missionConsole: MissionConsoleApi;
  }
}

export {};
