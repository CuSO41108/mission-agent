import { Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import CopilotPanel from "./CopilotPanel";
import CommandPalette from "./CommandPalette";
import NotificationPanel from "./NotificationPanel";
import { useMissionStore } from "@/store/useMissionStore";
import { useLocation } from "react-router-dom";
import { usePreferences } from "@/i18n";

export default function AppShell() {
  const copilotOpen = useMissionStore((s) => s.copilotOpen);
  const setCopilotOpen = useMissionStore((s) => s.setCopilotOpen);
  const location = useLocation();
  const { text: t } = usePreferences();
  const titles: Record<string, { title: string; breadcrumb: string[] }> = {
    "/": { title: t("指挥中心", "Command center"), breadcrumb: ["SECTOR", "DASHBOARD"] },
    "/folders": { title: t("任务舱库", "Mission folders"), breadcrumb: ["SECTOR", "FOLDERS"] },
    "/integrations": { title: t("接口舱", "Integrations"), breadcrumb: ["SECTOR", "INTEGRATIONS"] },
    "/workflow": { title: t("工作流编排", "Workflow builder"), breadcrumb: ["SECTOR", "WORKFLOW"] },
    "/agents": { title: t("Agent 控制台", "Agent console"), breadcrumb: ["SECTOR", "AGENTS"] },
    "/settings": { title: t("设置", "Settings"), breadcrumb: ["SYSTEM", "SETTINGS"] },
  };

  // 匹配路由标题（含动态路由）
  const key = Object.keys(titles).find((k) =>
    k === "/" ? location.pathname === "/" : location.pathname.startsWith(k)
  );
  const meta = titles[key ?? "/"];

  // 任务舱详情特殊面包屑
  let title = meta.title;
  let breadcrumb = meta.breadcrumb;
  if (location.pathname.startsWith("/folders/")) {
    title = t("任务舱详情", "Mission folder");
    breadcrumb = ["FOLDERS", "INTERIOR"];
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden text-ink">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 relative">
        <Topbar
          title={title}
          breadcrumb={breadcrumb}
          onToggleCopilot={() => setCopilotOpen(!copilotOpen)}
        />
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 overflow-hidden relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="h-full overflow-y-auto"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 右侧 AI 副驾 */}
          <AnimatePresence initial={false}>
            {copilotOpen && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 340, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="shrink-0 h-full overflow-hidden border-l border-phosphor-400/12 bg-obsidian-900/60 backdrop-blur-md"
              >
                <div className="w-[340px] h-full">
                  <CopilotPanel />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* 全局浮层：命令面板 + 通知抽屉 */}
      <CommandPalette />
      <NotificationPanel />
    </div>
  );
}
