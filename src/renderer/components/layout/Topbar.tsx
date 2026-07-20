import { useEffect, useState } from "react";
import { Search, Bell, PanelRight } from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { clockTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";

interface TopbarProps {
  title: string;
  breadcrumb?: string[];
  onToggleCopilot?: () => void;
}

export default function Topbar({ title, breadcrumb = [], onToggleCopilot }: TopbarProps) {
  const { text: t } = usePreferences();
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
    <header className="h-16 shrink-0 flex items-center justify-between gap-4 px-5 border-b border-obsidian-700 bg-obsidian-800 relative z-10">
      <div className="flex items-center gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
            {breadcrumb.length ? (
              breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span>/</span>}
                  <span>
                    {b}
                  </span>
                </span>
              ))
            ) : (
              <span>Mission Console</span>
            )}
          </div>
          <h2 className="font-display font-semibold text-[16px] text-ink leading-tight">
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint group-hover:text-ink-muted transition-colors" />
          <div className="w-full pl-9 pr-16 py-2 bg-obsidian-900 border border-obsidian-700 rounded text-[12px] text-ink-faint group-hover:border-obsidian-600 group-hover:bg-obsidian-850 transition-colors">
            {t("搜索舱体 / 待办 / 材料…", "Search folders / todos / materials…")}
          </div>
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] data-mono text-ink-faint border border-obsidian-700 bg-obsidian-800 rounded-sm pointer-events-none">
            ⌘K
          </kbd>
        </div>
      </button>

      {/* 右侧状态组 */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-[11px] data-mono text-ink leading-none">
            {clockTime(now)}
          </span>
          <span className="text-[9px] text-ink-faint mt-0.5">
            {t("北京时间", "Beijing time")}
          </span>
        </div>

        <button
          onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
          className={cn(
            "relative w-8 h-8 flex items-center justify-center border rounded transition-colors",
            notificationPanelOpen
              ? "border-phosphor-400/30 text-phosphor-500 bg-phosphor-400/10"
              : "border-obsidian-700 bg-obsidian-800 text-ink-muted hover:text-ink hover:bg-obsidian-850"
          )}
          title={t("通知", "Notifications")}
        >
          <Bell className="w-3.5 h-3.5" strokeWidth={1.5} />
          {badgeCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full text-[9px] data-mono bg-coral text-white font-bold">
              {badgeCount}
            </span>
          )}
        </button>

        <button
          onClick={() => (onToggleCopilot ? onToggleCopilot() : setCopilotOpen(!copilotOpen))}
          className={cn(
            "w-8 h-8 flex items-center justify-center border rounded transition-colors",
            copilotOpen
              ? "border-phosphor-400/30 text-phosphor-500 bg-phosphor-400/10"
              : "border-obsidian-700 bg-obsidian-800 text-ink-muted hover:text-ink hover:bg-obsidian-850"
          )}
          title={t("切换 AI 副驾", "Toggle AI copilot")}
        >
          <PanelRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
