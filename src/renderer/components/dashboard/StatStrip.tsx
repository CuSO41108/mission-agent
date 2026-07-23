import { Inbox, CheckCircle2, Bot, Zap } from "lucide-react";
import type { TaskFolder, AgentActivity } from "@/types";
import { usePreferences } from "@/i18n";
import { isAgentOnline } from "@/lib/missionStats";

interface StatStripProps {
  folders: TaskFolder[];
  activities: AgentActivity[];
}

export default function StatStrip({ folders, activities }: StatStripProps) {
  const { text: t } = usePreferences();
  const active = folders.filter((f) => f.status === "active").length;
  const done = folders.filter((f) => f.status === "done").length;
  const agentActive = folders.filter(isAgentOnline).length;
  const eventsToday = activities.length;

  const stats = [
    {
      label: t("活跃舱体", "Active folders"),
      value: active,
      icon: Inbox,
      color: "rgb(var(--phosphor-400))",
      suffix: "ACTIVE",
    },
    {
      label: t("已完成", "Completed"),
      value: done,
      icon: CheckCircle2,
      color: "rgb(var(--jade))",
      suffix: "DONE",
    },
    {
      label: t("Agent 在线", "Agents online"),
      value: agentActive,
      icon: Bot,
      color: "rgb(var(--violet))",
      suffix: "AGENTS",
    },
    {
      label: t("今日事件", "Today's events"),
      value: eventsToday,
      icon: Zap,
      color: "rgb(var(--amber-500))",
      suffix: "EVT/24H",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="panel px-4 py-3 relative overflow-hidden group hover:border-obsidian-600 transition-colors"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-ink-faint font-medium">
              {s.label}
            </span>
            <s.icon className="w-3 h-3" strokeWidth={1.5} style={{ color: s.color }} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-display font-semibold text-2xl data-mono leading-none text-ink"
            >
              {s.value}
            </span>
            <span className="text-[9px] data-mono text-ink-faint">{s.suffix}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
