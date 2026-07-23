import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Plug,
  Workflow,
  Bot,
  Settings,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";
import { useMissionStore } from "@/store/useMissionStore";
import { isAgentOnline } from "@/lib/missionStats";

export default function Sidebar() {
  const { text: t } = usePreferences();
  const activeAgentCount = useMissionStore((state) => state.folders.filter(isAgentOnline).length);
  const nav = [
    { to: "/", label: t("概览", "Overview"), icon: LayoutDashboard },
    { to: "/folders", label: t("任务舱", "Mission folders"), icon: FolderKanban },
    { to: "/integrations", label: t("集成", "Integrations"), icon: Plug },
    { to: "/workflow", label: t("工作流", "Workflows"), icon: Workflow },
    { to: "/agents", label: "Agent", icon: Bot },
  ];
  return (
    <aside className="w-[224px] shrink-0 h-full flex flex-col border-r border-obsidian-700 bg-obsidian-900 relative">
      {/* 品牌 */}
      <div className="px-4 py-[18px] border-b border-obsidian-700 relative">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 flex items-center justify-center rounded bg-phosphor-500 shadow-sm">
            <Command className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-[13px] text-ink leading-none">
              Mission Console
            </h1>
            <p className="text-[10px] text-ink-faint mt-1.5 leading-none">
              {t("本地任务工作台", "Local task workspace")}
            </p>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <div className="px-2 mb-2 text-[10px] font-medium text-ink-faint">
          {t("工作区", "Workspace")}
        </div>
        <ul className="space-y-1">
          {nav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-3 px-2.5 py-2 text-[13px] transition-all duration-200 rounded",
                    "border border-transparent font-medium",
                    isActive
                      ? "bg-phosphor-400/10 text-phosphor-600"
                      : "text-ink-muted hover:text-ink hover:bg-obsidian-850"
                  )
                }
              >
                <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span className="flex-1 font-medium">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* 底部状态 */}
      <div className="px-3 py-3 border-t border-obsidian-700 space-y-2">
        <div className="flex items-center justify-between px-2 text-[10px]">
          <span className="text-ink-faint">Agent</span>
          <span className="flex items-center gap-1.5 text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-jade" />
            {t(`${activeAgentCount} 个运行中`, `${activeAgentCount} active`)}
          </span>
        </div>
        <NavLink
          to="/settings"
          className="w-full mt-1 flex items-center gap-2 px-2 py-2 text-[12px] text-ink-muted hover:text-ink hover:bg-obsidian-850 rounded transition-colors"
        >
          <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>{t("设置", "Settings")}</span>
        </NavLink>
      </div>
    </aside>
  );
}
