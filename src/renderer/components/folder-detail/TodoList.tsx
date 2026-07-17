import { CheckCircle2, Circle, Clock, User, Bot, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Todo } from "@/types";
import { useMissionStore } from "@/store/useMissionStore";
import { shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";

interface TodoListProps {
  folderId: string;
  todos: Todo[];
}

export default function TodoList({ folderId, todos }: TodoListProps) {
  const { text: translate } = usePreferences();
  const toggle = useMissionStore((s) => s.toggleTodo);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([todos[0]?.id]));

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTodo = (t: Todo, depth = 0) => {
    const hasSubs = t.subtasks.length > 0;
    const isExpanded = expanded.has(t.id);
    return (
      <div key={t.id}>
        <div
          className={cn(
            "group flex items-start gap-2.5 px-2.5 py-2 border-l-2 transition-all",
            t.done
              ? "border-jade/40 bg-jade/5"
              : "border-transparent hover:border-phosphor-400/40 hover:bg-phosphor-400/3"
          )}
          style={{ marginLeft: depth * 16 }}
        >
          <button
            onClick={() => toggle(folderId, t.id)}
            className="mt-0.5 shrink-0"
          >
            {t.done ? (
              <CheckCircle2 className="w-4 h-4 text-jade" strokeWidth={1.5} />
            ) : (
              <Circle className="w-4 h-4 text-ink-faint group-hover:text-phosphor-400" strokeWidth={1.5} />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "text-[12px] leading-snug",
                  t.done ? "text-ink-faint line-through" : "text-ink"
                )}
              >
                {t.title}
              </span>
              <span
                className={cn(
                  "chip border text-[9px]",
                  t.assignee === "agent"
                    ? "border-phosphor-400/40 text-phosphor-400 bg-phosphor-400/5"
                    : "border-amber-500/40 text-amber-400 bg-amber-500/5"
                )}
              >
                {t.assignee === "agent" ? (
                  <Bot className="w-2.5 h-2.5" strokeWidth={1.5} />
                ) : (
                  <User className="w-2.5 h-2.5" strokeWidth={1.5} />
                )}
                {t.assignee === "agent" ? "AGENT" : "HUMAN"}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[9px] data-mono text-ink-faint">
              {t.dueDate && (
                <span className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" strokeWidth={1.5} />
                  {shortTime(t.dueDate)}
                </span>
              )}
              {t.source && <span className="truncate">&gt; {t.source}</span>}
              {hasSubs && (
                <button
                  onClick={() => toggleExpand(t.id)}
                  className="flex items-center gap-1 hover:text-phosphor-400 transition-colors"
                >
                  <ChevronRight
                    className={cn("w-2.5 h-2.5 transition-transform", isExpanded && "rotate-90")}
                    strokeWidth={1.5}
                  />
                  {t.subtasks.length} {t.subtasks.length === 1 ? translate("子任务", "subtask") : translate("子任务", "subtasks")}
                </button>
              )}
            </div>
          </div>
        </div>
        {hasSubs && isExpanded && (
          <div className="mt-0.5">
            {t.subtasks.map((st) => renderTodo(st, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const doneCount = todos.filter((t) => t.done).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 bg-phosphor-400 animate-pulse-dot" />
          <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
            {translate("待办清单", "Todo list")}
          </h3>
        </div>
        <span className="text-[10px] data-mono text-ink-faint">
          {doneCount}/{todos.length} · {todos.length - doneCount} OPEN
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {todos.map((t) => renderTodo(t))}
        <button className="w-full mt-2 px-4 py-2 text-[11px] text-ink-faint hover:text-phosphor-400 text-left border border-dashed border-white/5 hover:border-phosphor-400/30 transition-all">
          + {translate("添加待办…", "Add todo…")}
        </button>
      </div>
    </div>
  );
}
