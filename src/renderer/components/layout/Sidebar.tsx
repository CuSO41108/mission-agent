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

const nav = [
  { to: "/", label: "指挥中心", icon: LayoutDashboard, code: "CMD-01" },
  { to: "/folders", label: "任务舱库", icon: FolderKanban, code: "CMD-02" },
  { to: "/integrations", label: "接口舱", icon: Plug, code: "CMD-03" },
  { to: "/workflow", label: "工作流", icon: Workflow, code: "CMD-04" },
  { to: "/agents", label: "Agent 控制台", icon: Bot, code: "CMD-05" },
];

export default function Sidebar() {
  return (
    <aside className="w-[220px] shrink-0 h-full flex flex-col border-r border-phosphor-400/12 bg-obsidian-900/60 backdrop-blur-md relative">
      {/* 品牌 */}
      <div className="px-4 py-4 border-b border-phosphor-400/12 relative">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 flex items-center justify-center border border-phosphor-400/50 bg-phosphor-400/5">
            <span className="absolute inset-0 bg-scanline opacity-30" />
            <Command className="w-4 h-4 text-phosphor-400" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-[13px] tracking-[0.12em] text-ink leading-none">
              MISSION
            </h1>
            <p className="font-display text-[10px] tracking-[0.3em] text-phosphor-400/80 mt-1 leading-none">
              CONSOLE
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[9px] data-mono text-ink-faint">
          <span className="w-1 h-1 bg-jade animate-pulse-dot" />
          SYS · ONLINE
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <div className="px-2 mb-2 text-[9px] uppercase tracking-[0.25em] text-ink-faint">
          导航 / NAV
        </div>
        <ul className="space-y-1">
          {nav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-3 px-2.5 py-2 text-[13px] transition-all duration-150",
                    "border border-transparent",
                    isActive
                      ? "bg-phosphor-400/10 text-phosphor-100 border-phosphor-400/30"
                      : "text-ink-muted hover:text-ink hover:bg-white/3"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-phosphor-400 shadow-glow-phosphor" />
                    )}
                    <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                    <span className="flex-1 font-medium">{item.label}</span>
                    <span className="text-[8px] data-mono text-ink-faint group-hover:text-phosphor-400/70">
                      {item.code}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* 底部状态 */}
      <div className="px-3 py-3 border-t border-phosphor-400/12 space-y-2">
        <div className="flex items-center justify-between text-[10px] data-mono">
          <span className="text-ink-faint">AGENT</span>
          <span className="flex items-center gap-1.5 text-jade">
            <span className="w-1 h-1 bg-jade animate-pulse-dot" />
            3 ACTIVE
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] data-mono">
          <span className="text-ink-faint">SYNC</span>
          <span className="text-phosphor-400">4/8 CONN</span>
        </div>
        <button className="w-full mt-1 flex items-center gap-2 px-2 py-1.5 text-[10px] text-ink-faint hover:text-ink-muted border border-white/5 hover:border-white/10 transition-colors">
          <Settings className="w-3 h-3" strokeWidth={1.5} />
          <span className="uppercase tracking-wider">设置</span>
        </button>
      </div>
    </aside>
  );
}
