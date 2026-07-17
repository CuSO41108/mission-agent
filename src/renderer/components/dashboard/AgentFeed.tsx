import { Bot, Zap, Bell, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AgentActivity } from "@/types";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";

interface AgentFeedProps {
  activities: AgentActivity[];
}

const TYPE_META: Record<
  AgentActivity["type"],
  { color: string; icon: typeof Bot; label: string }
> = {
  sync: { color: "rgb(var(--phosphor-400))", icon: Zap, label: "SYNC" },
  create: { color: "rgb(var(--violet))", icon: Bot, label: "CREATE" },
  notify: { color: "rgb(var(--amber-500))", icon: Bell, label: "NOTIFY" },
  update: { color: "rgb(var(--jade))", icon: CheckCircle2, label: "UPDATE" },
  warn: { color: "rgb(var(--coral))", icon: AlertTriangle, label: "WARN" },
};

export default function AgentFeed({ activities }: AgentFeedProps) {
  const { locale, text: t } = usePreferences();
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 bg-phosphor-400 animate-pulse-dot" />
          <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
            {t("Agent 活动流", "Agent activity")}
          </h3>
        </div>
        <span className="text-[9px] data-mono text-phosphor-400/70">
          LIVE · {activities.length} EVT
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {activities.map((a, i) => {
          const meta = TYPE_META[a.type];
          const Icon = meta.icon;
          return (
            <div key={a.id} className="relative flex gap-3 group">
              {/* 时间轴竖线 */}
              {i < activities.length - 1 && (
                <span className="absolute left-[11px] top-7 bottom-[-14px] w-px bg-phosphor-400/15" />
              )}
              <div
                className="relative z-10 w-[22px] h-[22px] shrink-0 flex items-center justify-center border"
                style={{
                  borderColor: `color-mix(in srgb, ${meta.color} 31%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${meta.color} 6%, transparent)`,
                }}
              >
                <Icon className="w-3 h-3" strokeWidth={1.5} style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span
                    className="font-display text-[9px] uppercase tracking-[0.15em] data-mono"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[9px] data-mono text-ink-faint shrink-0">
                    {relativeTime(a.timestamp, locale)}
                  </span>
                </div>
                <p className="text-[12px] text-ink leading-snug">{a.action}</p>
                <p className="text-[10px] data-mono text-ink-faint mt-0.5 truncate">
                  &gt; {a.folderName}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
