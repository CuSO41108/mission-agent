import { Link } from "react-router-dom";
import { Clock, ArrowUpRight, AlertTriangle } from "lucide-react";
import type { TaskFolder } from "@/types";
import PriorityBadge from "@/components/ui/PriorityBadge";
import { countdown } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FocusCardProps {
  folder: TaskFolder;
  variant?: "hero" | "mini";
}

export default function FocusCard({ folder, variant = "mini" }: FocusCardProps) {
  const cd = countdown(folder.deadline);
  const isHero = variant === "hero";
  const doneTodos = folder.todos.filter((t) => t.done).length;

  return (
    <Link
      to={`/folders/${folder.id}`}
      className={cn(
        "group relative block panel overflow-hidden transition-all duration-200",
        "hover:border-phosphor-400/50 hover:shadow-glow-phosphor",
        isHero ? "p-5 h-full" : "p-3.5 h-full"
      )}
      style={{ borderColor: `${folder.coverColor}30` }}
    >
      {/* 优先级条 */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{
          background: folder.coverColor,
          boxShadow: `0 0 12px ${folder.coverColor}`,
        }}
      />

      {/* 背景大字水印 */}
      <span
        className="pointer-events-none absolute -right-2 -bottom-4 font-display font-bold opacity-[0.04] leading-none select-none"
        style={{ fontSize: isHero ? 120 : 80, color: folder.coverColor }}
      >
        {folder.progress}
      </span>

      <div className="relative flex flex-col h-full">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <PriorityBadge priority={folder.priority} />
            <span className="text-[9px] data-mono text-ink-faint uppercase tracking-wider">
              {folder.category}
            </span>
          </div>
          <ArrowUpRight className="w-3.5 h-3.5 text-ink-faint group-hover:text-phosphor-400 transition-colors" />
        </div>

        <h3
          className={cn(
            "font-display font-bold text-ink leading-tight mb-3 line-clamp-2",
            isHero ? "text-lg" : "text-[13px]"
          )}
        >
          {folder.name}
        </h3>

        {isHero && (
          <p className="text-[11px] text-ink-muted leading-relaxed mb-4 line-clamp-2">
            {folder.todos[0]?.title ?? "暂无待办"}
          </p>
        )}

        {/* 倒计时 */}
        <div className="mt-auto">
          <div className="flex items-end justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              {cd.overdue ? (
                <AlertTriangle className="w-3 h-3 text-coral" strokeWidth={1.5} />
              ) : (
                <Clock
                  className={cn("w-3 h-3", cd.urgent ? "text-amber-400" : "text-phosphor-400")}
                  strokeWidth={1.5}
                />
              )}
              <span
                className={cn(
                  "data-mono font-bold",
                  isHero ? "text-2xl" : "text-base",
                  cd.overdue
                    ? "text-coral text-glow-coral"
                    : cd.urgent
                      ? "text-amber-400 text-glow-amber"
                      : "text-phosphor-400 text-glow-phosphor"
                )}
              >
                {cd.text}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span
                className={cn(
                  "data-mono font-bold text-glow-phosphor",
                  isHero ? "text-xl" : "text-sm"
                )}
                style={{ color: folder.coverColor }}
              >
                {folder.progress}%
              </span>
              <span className="text-[9px] data-mono text-ink-faint">
                {doneTodos}/{folder.todos.length} DONE
              </span>
            </div>
          </div>

          {/* 进度条 */}
          <div className="h-[3px] bg-white/5 overflow-hidden">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${folder.progress}%`,
                background: folder.coverColor,
                boxShadow: `0 0 8px ${folder.coverColor}`,
              }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
