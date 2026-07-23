import { Link } from "react-router-dom";
import { Clock, ArrowUpRight, AlertTriangle } from "lucide-react";
import type { TaskFolder } from "@/types";
import PriorityBadge from "@/components/ui/PriorityBadge";
import { countdown } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";
import { accentTint, themeAccent } from "@/lib/theme";
import { countTodos } from "@/lib/missionStats";

interface FocusCardProps {
  folder: TaskFolder;
  variant?: "hero" | "mini";
}

export default function FocusCard({ folder, variant = "mini" }: FocusCardProps) {
  const { locale, text: t } = usePreferences();
  const cd = countdown(folder.deadline, locale);
  const isHero = variant === "hero";
  const todoCounts = countTodos(folder.todos);
  const coverColor = themeAccent(folder.coverColor);

  return (
    <Link
      to={`/folders/${folder.id}`}
      className={cn(
        "group relative block panel overflow-hidden transition-all duration-200",
        "hover:border-obsidian-600 hover:shadow-panel",
        isHero ? "p-4 sm:p-5 h-full min-h-[210px]" : "p-3.5 h-full"
      )}
      style={{ borderColor: accentTint(folder.coverColor, 0.19) }}
    >
      {/* 优先级条 */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: coverColor }}
      />

      {/* 背景大字水印 */}
      <span
        className="pointer-events-none absolute -right-2 -bottom-4 font-display font-bold opacity-[0.04] leading-none select-none"
        style={{ fontSize: isHero ? 120 : 80, color: coverColor }}
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
            "font-display font-bold text-ink leading-snug mb-2 break-words [overflow-wrap:anywhere]",
            isHero ? "text-base sm:text-lg" : "text-[13px] line-clamp-2"
          )}
        >
          {folder.name}
        </h3>

        {isHero && (
          <p className="text-[11px] text-ink-muted leading-relaxed mb-3 line-clamp-2 break-words [overflow-wrap:anywhere]">
            {folder.todos[0]?.title ?? t("暂无待办", "No todos yet")}
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
                  isHero ? "text-xl sm:text-2xl" : "text-base",
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
                style={{ color: coverColor }}
              >
                {folder.progress}%
              </span>
              <span className="text-[9px] data-mono text-ink-faint">
                {todoCounts.done}/{todoCounts.total} DONE
              </span>
            </div>
          </div>

          {/* 进度条 */}
          <div className="h-[3px] bg-obsidian-850 rounded-sm overflow-hidden">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${folder.progress}%`,
                background: coverColor,
              }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
