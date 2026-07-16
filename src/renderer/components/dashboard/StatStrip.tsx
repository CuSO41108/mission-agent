import { Inbox, CheckCircle2, Bot, Zap } from "lucide-react";
import type { TaskFolder, AgentActivity } from "@/types";

interface StatStripProps {
  folders: TaskFolder[];
  activities: AgentActivity[];
}

export default function StatStrip({ folders, activities }: StatStripProps) {
  const active = folders.filter((f) => f.status === "active").length;
  const done = folders.filter((f) => f.status === "done").length;
  const agentActive = folders.filter((f) => f.agentConfig.enabled).length;
  const eventsToday = activities.length;

  const stats = [
    {
      label: "活跃舱体",
      value: active,
      icon: Inbox,
      color: "#00E5D4",
      suffix: "ACTIVE",
    },
    {
      label: "已完成",
      value: done,
      icon: CheckCircle2,
      color: "#7FD1B9",
      suffix: "DONE",
    },
    {
      label: "Agent 在线",
      value: agentActive,
      icon: Bot,
      color: "#9D8CFF",
      suffix: "AGENTS",
    },
    {
      label: "今日事件",
      value: eventsToday,
      icon: Zap,
      color: "#FFB547",
      suffix: "EVT/24H",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="panel px-4 py-3 relative overflow-hidden group hover:border-phosphor-400/30 transition-colors"
        >
          {/* 装饰扫描 */}
          <span
            className="absolute top-0 right-0 w-12 h-12 opacity-10 group-hover:opacity-20 transition-opacity"
            style={{
              background: `radial-gradient(circle at top right, ${s.color}, transparent 70%)`,
            }}
          />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] uppercase tracking-[0.2em] text-ink-faint font-display">
              {s.label}
            </span>
            <s.icon className="w-3 h-3" strokeWidth={1.5} style={{ color: s.color }} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-display font-bold text-2xl data-mono leading-none"
              style={{ color: s.color, textShadow: `0 0 12px ${s.color}66` }}
            >
              {String(s.value).padStart(2, "0")}
            </span>
            <span className="text-[9px] data-mono text-ink-faint">{s.suffix}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
