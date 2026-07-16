import { useEffect, useState } from "react";
import { Search, Bell, PanelRight, Cpu, Activity } from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { clockTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TopbarProps {
  title: string;
  breadcrumb?: string[];
  onToggleCopilot?: () => void;
}

export default function Topbar({ title, breadcrumb = [], onToggleCopilot }: TopbarProps) {
  const [now, setNow] = useState(Date.now());
  const setCopilotOpen = useMissionStore((s) => s.setCopilotOpen);
  const copilotOpen = useMissionStore((s) => s.copilotOpen);
  const folders = useMissionStore((s) => s.folders);
  const notifications = useMissionStore((s) => s.notifications);
  const setCommandPaletteOpen = useMissionStore((s) => s.setCommandPaletteOpen);
  const setNotificationPanelOpen = useMissionStore((s) => s.setNotificationPanelOpen);
  const notificationPanelOpen = useMissionStore((s) => s.notificationPanelOpen);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const overdueCount = folders.filter(
    (f) => f.deadline && f.deadline < Date.now() && f.status === "active"
  ).length;
  const unreadCount = notifications.filter((n) => !n.read).length;
  const badgeCount = Math.max(overdueCount, unreadCount);

  return (
    <header className="h-14 shrink-0 flex items-center justify-between gap-4 px-5 border-b border-phosphor-400/12 bg-obsidian-900/40 backdrop-blur-md relative z-10">
      <div className="flex items-center gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] data-mono text-ink-faint uppercase tracking-[0.2em]">
            {breadcrumb.length ? (
              breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-phosphor-400/40">/</span>}
                  <span className={i === breadcrumb.length - 1 ? "text-phosphor-400" : ""}>
                    {b}
                  </span>
                </span>
              ))
            ) : (
              <span>SECTOR · MAIN</span>
            )}
          </div>
          <h2 className="font-display font-bold text-[17px] text-ink leading-tight tracking-tight">
            {title}
          </h2>
        </div>
      </div>

      {/* 命令栏搜索 - 点击触发命令面板 */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="flex-1 max-w-md mx-auto hidden md:block text-left"
      >
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint group-hover:text-phosphor-400 transition-colors" />
          <div className="w-full pl-9 pr-16 py-2 bg-obsidian-850/60 border border-phosphor-400/15 text-[12px] text-ink-faint group-hover:border-phosphor-400/30 group-hover:bg-obsidian-850/80 transition-colors data-mono">
            搜索舱体 / 待办 / 材料…
          </div>
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] data-mono text-phosphor-400/70 border border-phosphor-400/30 bg-phosphor-400/5 pointer-events-none">
            ⌘K
          </kbd>
        </div>
      </button>

      {/* 右侧状态组 */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden lg:flex items-center gap-3 text-[10px] data-mono">
          <span className="flex items-center gap-1.5 text-ink-faint">
            <Cpu className="w-3 h-3" strokeWidth={1.5} />
            <span className="text-phosphor-400">42%</span>
          </span>
          <span className="flex items-center gap-1.5 text-ink-faint">
            <Activity className="w-3 h-3" strokeWidth={1.5} />
            <span className="text-jade">OK</span>
          </span>
        </div>

        <div className="hidden sm:flex flex-col items-end">
          <span className="text-[11px] data-mono text-ink leading-none">
            {clockTime(now)}
          </span>
          <span className="text-[9px] data-mono text-ink-faint mt-0.5">
            UTC+8 · BEIJING
          </span>
        </div>

        <button
          onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
          className={cn(
            "relative w-8 h-8 flex items-center justify-center border transition-colors",
            notificationPanelOpen
              ? "border-phosphor-400/50 text-phosphor-400 bg-phosphor-400/10"
              : "border-phosphor-400/15 text-ink-muted hover:text-phosphor-400 hover:border-phosphor-400/40"
          )}
          title="通知"
        >
          <Bell className="w-3.5 h-3.5" strokeWidth={1.5} />
          {badgeCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 flex items-center justify-center text-[9px] data-mono bg-coral text-obsidian-900 font-bold">
              {badgeCount}
            </span>
          )}
        </button>

        <button
          onClick={() => (onToggleCopilot ? onToggleCopilot() : setCopilotOpen(!copilotOpen))}
          className={cn(
            "w-8 h-8 flex items-center justify-center border transition-colors",
            copilotOpen
              ? "border-phosphor-400/40 text-phosphor-400 bg-phosphor-400/10"
              : "border-phosphor-400/15 text-ink-muted hover:text-phosphor-400 hover:border-phosphor-400/40"
          )}
          title="切换 AI 副驾"
        >
          <PanelRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
