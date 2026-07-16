import { User, Bot, Server, Cog } from "lucide-react";
import type { TimelineEntry } from "@/types";
import { shortTime } from "@/lib/format";

const ACTOR_META: Record<
  TimelineEntry["actor"],
  { icon: typeof User; color: string; label: string }
> = {
  human: { icon: User, color: "#FFB547", label: "HUMAN" },
  agent: { icon: Bot, color: "#00E5D4", label: "AGENT" },
  system: { icon: Server, color: "#9D8CFF", label: "SYS" },
};

interface TimelineViewProps {
  entries: TimelineEntry[];
}

export default function TimelineView({ entries }: TimelineViewProps) {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Cog className="w-3 h-3 text-phosphor-400" strokeWidth={1.5} />
          <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
            进度时间线
          </h3>
        </div>
        <span className="text-[10px] data-mono text-ink-faint">
          {sorted.length} EVT
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="relative">
          {/* 竖向轴线 */}
          <span className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-phosphor-400/30 via-phosphor-400/15 to-transparent" />

          <div className="space-y-4">
            {sorted.map((e) => {
              const meta = ACTOR_META[e.actor];
              const Icon = meta.icon;
              return (
                <div key={e.id} className="relative flex gap-3">
                  <div
                    className="relative z-10 w-[30px] h-[30px] shrink-0 flex items-center justify-center border bg-obsidian-900"
                    style={{
                      borderColor: `${meta.color}50`,
                      boxShadow: `0 0 0 3px #0a0e14`,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span
                        className="font-display text-[9px] uppercase tracking-[0.15em] data-mono"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[9px] data-mono text-ink-faint">
                        {shortTime(e.timestamp)}
                      </span>
                    </div>
                    <p className="text-[12px] text-ink leading-snug">{e.action}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
