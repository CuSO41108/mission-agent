import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Sparkles,
  Bot,
  User,
  Zap,
  Plus,
  ListChecks,
  Activity,
  ChevronDown,
  ChevronRight,
  Brain,
  Folder,
  FileText,
  Link as LinkIcon,
  Mail,
  Check,
  Loader2,
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CopilotMessage, CopilotReference } from "@/types";
import { usePreferences } from "@/i18n";

const REF_ICON = {
  folder: Folder,
  todo: ListChecks,
  material: FileText,
  integration: Mail,
};

function RefChip({ reference: r }: { reference: CopilotReference }) {
  const navigate = useNavigate();
  const Icon = REF_ICON[r.kind] || LinkIcon;
  const onClick = () => {
    if (r.kind === "folder" && r.id && !r.id.startsWith("draft")) {
      navigate(`/folders/${r.id}`);
    }
  };
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] border border-phosphor-400/30 bg-phosphor-400/5 text-phosphor-200 hover:bg-phosphor-400/12 hover:border-phosphor-400/50 transition-colors"
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={1.5} />
      <span>{r.label}</span>
      {r.meta && (
        <span className="data-mono text-[9px] text-phosphor-400/70 ml-0.5">
          {r.meta}
        </span>
      )}
    </button>
  );
}

function ThinkingBlock({
  summary,
  steps,
}: {
  summary: string;
  steps: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-phosphor-400/10 bg-obsidian-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-phosphor-400/80 hover:text-phosphor-300 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        )}
        <Brain className="w-3 h-3" strokeWidth={1.5} />
        <span className="data-mono">{summary}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden px-6 pb-2 space-y-1"
          >
            {steps.map((s, i) => (
              <li
                key={i}
                className="text-[10px] data-mono text-ink-muted leading-relaxed flex gap-2"
              >
                <span className="text-phosphor-400/40 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionButton({
  label,
  variant,
  done,
  onClick,
}: {
  label: string;
  variant: "primary" | "ghost";
  done?: boolean;
  onClick: () => void;
}) {
  const { text: t } = usePreferences();
  return (
    <button
      onClick={onClick}
      disabled={done}
      className={cn(
        "px-3 py-1.5 text-[11px] font-medium border transition-all flex items-center gap-1.5",
        variant === "primary"
          ? "bg-phosphor-400/12 border-phosphor-400/50 text-phosphor-100 hover:bg-phosphor-400/20"
          : "bg-transparent border-white/10 text-ink-muted hover:text-ink hover:border-white/25",
        done && "opacity-50 cursor-not-allowed"
      )}
    >
      {done ? (
        <Check className="w-2.5 h-2.5" strokeWidth={2} />
      ) : (
        <Zap className="w-2.5 h-2.5" strokeWidth={1.5} />
      )}
      {done ? t("已执行", "Executed") : label}
    </button>
  );
}

function MessageBubble({ m }: { m: CopilotMessage }) {
  const { text: t } = usePreferences();
  const navigate = useNavigate();
  const runCopilotAction = useMissionStore((s) => s.runCopilotAction);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "flex gap-2.5",
        m.role === "user" ? "flex-row-reverse" : ""
      )}
    >
      <div
        className={cn(
          "w-6 h-6 shrink-0 flex items-center justify-center border",
          m.role === "agent"
            ? "border-phosphor-400/40 bg-phosphor-400/8 text-phosphor-400"
            : "border-amber-500/40 bg-amber-500/8 text-amber-400"
        )}
      >
        {m.role === "agent" ? (
          <Bot className="w-3 h-3" strokeWidth={1.5} />
        ) : (
          <User className="w-3 h-3" strokeWidth={1.5} />
        )}
      </div>

      <div
        className={cn(
          "max-w-[85%] flex flex-col gap-1.5",
          m.role === "user" && "items-end"
        )}
      >
        {/* 思考过程（折叠） */}
        {m.thinking && <ThinkingBlock summary={m.thinking.summary} steps={m.thinking.steps} />}

        {/* 内容气泡 */}
        <div
          className={cn(
            "px-3 py-2 text-[12px] leading-relaxed border",
            m.role === "agent"
              ? "bg-obsidian-800/70 border-phosphor-400/20 text-ink"
              : "bg-amber-500/8 border-amber-500/30 text-ink"
          )}
        >
          {m.content || (m.streaming && (
            <span className="inline-flex items-center gap-1.5 text-phosphor-400/70">
              <Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={1.5} />
              <span className="text-[10px] data-mono">{t("正在生成…", "Generating…")}</span>
            </span>
          ))}
          {m.streaming && m.content && (
            <span className="inline-block w-1.5 h-3.5 bg-phosphor-400 ml-0.5 animate-pulse-dot align-middle" />
          )}
        </div>

        {/* 引用芯片 */}
        {m.references && m.references.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.references.map((r, i) => (
              <RefChip key={i} reference={r} />
            ))}
          </div>
        )}

        {/* 行动卡片 */}
        {m.actions && m.actions.length > 0 && !m.streaming && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {m.actions.map((a) => (
              <ActionButton
                key={a.id}
                label={a.label}
                variant={a.variant}
                done={a.done}
                onClick={() => {
                  runCopilotAction(m.id, a.id);
                  // 简单路由：根据 command 做跳转
                  if (a.command.includes("查看") || a.command.includes("详情") || a.command.includes("进度")) {
                    navigate("/");
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* 元信息 */}
        <span className="text-[9px] data-mono text-ink-faint px-1 flex items-center gap-1.5">
          <span>{shortTime(m.timestamp)}</span>
          {m.meta && (
            <>
              <span className="text-phosphor-400/30">·</span>
              <span className="text-phosphor-400/60">{m.meta.model}</span>
              <span className="text-phosphor-400/30">·</span>
              <span>{m.meta.tokensOut} tokens</span>
              <span className="text-phosphor-400/30">·</span>
              <span>{(m.meta.durationMs / 1000).toFixed(1)}s</span>
            </>
          )}
        </span>
      </div>
    </motion.div>
  );
}

export default function CopilotPanel() {
  const { text: t } = usePreferences();
  const messages = useMissionStore((s) => s.copilotMessages);
  const streaming = useMissionStore((s) => s.copilotStreaming);
  const send = useMissionStore((s) => s.sendCopilot);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const quickCmds = [
    { icon: Activity, label: t("今日进度", "Today’s progress"), text: t("今日整体进度如何？", "How is overall progress today?") },
    { icon: Zap, label: t("催办紧急", "Chase urgent work"), text: t("催办今日截止的紧急任务", "Follow up on urgent tasks due today") },
    { icon: ListChecks, label: t("生成待办", "Generate todos"), text: t("为新品发布舱生成待办清单", "Generate a todo list for the product launch folder") },
    { icon: Plus, label: t("新建舱体", "New folder"), text: t("新建一个舱体：下周客户演示", "Create a folder: client demo next week") },
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    send(content);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-phosphor-400/12">
        <div className="flex items-center gap-2.5">
          <div className="relative w-7 h-7 flex items-center justify-center border border-phosphor-400/50 bg-phosphor-400/8">
            <Bot className="w-3.5 h-3.5 text-phosphor-400" strokeWidth={1.5} />
            <span className="absolute inset-0 bg-scanline opacity-20 animate-flicker" />
          </div>
          <div>
            <h3 className="font-display text-[12px] uppercase tracking-[0.18em] text-ink leading-none">
              {t("AI 副驾", "AI copilot")}
            </h3>
            <p className="text-[9px] data-mono text-phosphor-400/70 mt-1 leading-none flex items-center gap-1">
              <span className={cn("w-1 h-1", streaming ? "bg-amber-400 animate-pulse-dot" : "bg-jade animate-pulse-dot")} />
              {streaming ? "COPILOT · THINKING" : "COPILOT · READY"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-[10px] data-mono text-ink-faint hover:text-phosphor-400 transition-colors border border-phosphor-400/15 hover:border-phosphor-400/40 px-2 py-1"
            title={t("清空上下文", "Clear context")}
          >
            {t("清空", "Clear")}
          </button>
          <Sparkles className="w-3.5 h-3.5 text-phosphor-400/60" strokeWidth={1.5} />
        </div>
      </header>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}
      </div>

      {/* 快捷指令 */}
      <div className="px-3 py-2 border-t border-phosphor-400/10 flex flex-wrap gap-1.5">
        {quickCmds.map((c) => (
          <button
            key={c.label}
            onClick={() => handleSend(c.text)}
            disabled={streaming}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-[10px] border transition-colors",
              streaming
                ? "opacity-40 cursor-not-allowed border-white/5 text-ink-faint"
                : "text-ink-muted hover:text-phosphor-100 border-phosphor-400/15 hover:border-phosphor-400/40 hover:bg-phosphor-400/8"
            )}
          >
            <c.icon className="w-2.5 h-2.5" strokeWidth={1.5} />
            {c.label}
          </button>
        ))}
      </div>

      {/* 输入 */}
      <div className="p-3 border-t border-phosphor-400/12">
        <div className="relative group">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={streaming}
            placeholder={streaming ? t("Agent 思考中…", "Agent is thinking…") : t("下达指令…", "Give an instruction…")}
            className={cn(
              "w-full pl-3 pr-10 py-2.5 bg-obsidian-850/80 border text-[12px] text-ink placeholder:text-ink-faint focus:outline-none transition-colors",
              streaming
                ? "border-phosphor-400/10 cursor-not-allowed"
                : "border-phosphor-400/20 focus:border-phosphor-400/60 focus:bg-obsidian-850"
            )}
          />
          <button
            onClick={() => handleSend()}
            disabled={streaming || !input.trim()}
            className={cn(
              "absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center border transition-colors",
              streaming || !input.trim()
                ? "opacity-30 cursor-not-allowed bg-phosphor-400/5 border-phosphor-400/20 text-phosphor-400/40"
                : "bg-phosphor-400/15 border-phosphor-400/40 text-phosphor-300 hover:bg-phosphor-400/25 hover:text-phosphor-100"
            )}
          >
            <Send className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
