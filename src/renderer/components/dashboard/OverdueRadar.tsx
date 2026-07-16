import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { TaskFolder } from "@/types";
import PriorityBadge from "@/components/ui/PriorityBadge";
import { relativeTime } from "@/lib/format";

interface OverdueRadarProps {
  folders: TaskFolder[];
}

export default function OverdueRadar({ folders }: OverdueRadarProps) {
  const overdue = folders.filter(
    (f) => f.deadline && f.deadline < Date.now() && f.status === "active"
  );
  const urgent = folders.filter(
    (f) =>
      f.deadline &&
      f.deadline > Date.now() &&
      f.deadline < Date.now() + 24 * 60 * 60 * 1000 &&
      f.status === "active"
  );
  const items = [...overdue, ...urgent].slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-coral animate-ping opacity-60" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-coral shadow-glow-coral" />
          </span>
          <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
            逾期雷达
          </h3>
        </div>
        <span className="text-[9px] data-mono text-coral">{overdue.length} OVERDUE</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <span className="w-2 h-2 bg-jade mb-2 animate-pulse-dot" />
            <p className="text-[11px] text-ink-muted">无逾期 · 全部在线</p>
          </div>
        ) : (
          items.map((f) => {
            const isOverdue = f.deadline! < Date.now();
            return (
              <Link
                key={f.id}
                to={`/folders/${f.id}`}
                className="group flex items-center gap-2.5 px-2.5 py-2 border border-transparent hover:border-phosphor-400/30 hover:bg-phosphor-400/5 transition-all"
              >
                <AlertTriangle
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isOverdue ? "text-coral" : "text-amber-400"
                  }`}
                  strokeWidth={1.5}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-ink truncate group-hover:text-phosphor-100">
                    {f.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <PriorityBadge priority={f.priority} />
                    <span
                      className={`text-[9px] data-mono ${
                        isOverdue ? "text-coral" : "text-amber-400"
                      }`}
                    >
                      {relativeTime(f.deadline)}
                    </span>
                  </div>
                </div>
                <ArrowRight
                  className="w-3 h-3 text-ink-faint group-hover:text-phosphor-400 transition-colors"
                  strokeWidth={1.5}
                />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
