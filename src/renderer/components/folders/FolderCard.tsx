import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Bot,
  Paperclip,
  CheckCircle2,
  Circle,
  Clock,
  ArrowUpRight,
  Pause,
} from "lucide-react";
import type { TaskFolder } from "@/types";
import PriorityBadge from "@/components/ui/PriorityBadge";
import StatusDot from "@/components/ui/StatusDot";
import { countdown, STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FolderCardProps {
  folder: TaskFolder;
  index?: number;
}

export default function FolderCard({ folder, index = 0 }: FolderCardProps) {
  const cd = countdown(folder.deadline);
  const doneTodos = folder.todos.filter((t) => t.done).length;
  const totalTodos = folder.todos.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Link
        to={`/folders/${folder.id}`}
        className="group relative block panel h-full overflow-hidden transition-all duration-200 hover:border-phosphor-400/50 hover:shadow-glow-phosphor"
        style={{ borderColor: `${folder.coverColor}28` }}
      >
        {/* 顶部色带 */}
        <div
          className="h-[3px] w-full"
          style={{
            background: `linear-gradient(90deg, ${folder.coverColor}, transparent)`,
            boxShadow: `0 0 12px ${folder.coverColor}`,
          }}
        />

        <div className="p-4 flex flex-col h-full">
          {/* 头部 */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <PriorityBadge priority={folder.priority} />
              <span className="chip border-ink-faint/30 text-ink-faint">
                <StatusDot status={folder.status} />
                {STATUS_LABEL[folder.status]}
              </span>
            </div>
            {folder.status === "paused" && (
              <Pause className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.5} />
            )}
          </div>

          {/* 标题 */}
          <h3 className="font-display font-bold text-[14px] text-ink leading-snug mb-1 line-clamp-2 group-hover:text-phosphor-100 transition-colors">
            {folder.name}
          </h3>
          <p className="text-[10px] data-mono text-ink-faint uppercase tracking-wider mb-3">
            {folder.category} · {folder.id.toUpperCase()}
          </p>

          {/* 倒计时 + 进度 */}
          <div className="flex items-end justify-between gap-2 mb-3">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-ink-faint mb-0.5 font-display">
                截止
              </p>
              <span
                className={cn(
                  "data-mono font-bold text-sm",
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
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-wider text-ink-faint mb-0.5 font-display">
                进度
              </p>
              <span
                className="data-mono font-bold text-lg leading-none"
                style={{ color: folder.coverColor, textShadow: `0 0 10px ${folder.coverColor}55` }}
              >
                {folder.progress}%
              </span>
            </div>
          </div>

          {/* 进度条 */}
          <div className="h-[3px] bg-white/5 overflow-hidden mb-3">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${folder.progress}%`,
                background: folder.coverColor,
                boxShadow: `0 0 8px ${folder.coverColor}`,
              }}
            />
          </div>

          {/* 底部 meta */}
          <div className="mt-auto flex items-center justify-between text-[10px] data-mono text-ink-faint pt-2 border-t border-white/5">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
              {doneTodos}/{totalTodos}
            </span>
            <span className="flex items-center gap-1">
              <Paperclip className="w-3 h-3" strokeWidth={1.5} />
              {folder.materials.length}
            </span>
            <span
              className={cn(
                "flex items-center gap-1",
                folder.agentConfig.enabled ? "text-phosphor-400" : "text-ink-faint"
              )}
            >
              <Bot className="w-3 h-3" strokeWidth={1.5} />
              {folder.agentConfig.enabled ? "AUTO" : "MANUAL"}
            </span>
            <ArrowUpRight className="w-3 h-3 group-hover:text-phosphor-400 transition-colors" strokeWidth={1.5} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
