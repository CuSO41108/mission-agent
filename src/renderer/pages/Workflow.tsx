import { motion } from "framer-motion";
import {
  Workflow as WorkflowIcon,
  Plus,
  Zap,
  GitBranch,
  ArrowRight,
  Filter,
  Play,
  Pause,
  Radio,
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function WorkflowPage() {
  const workflows = useMissionStore((s) => s.workflows);
  const toggle = useMissionStore((s) => s.toggleWorkflow);

  const enabledCount = workflows.filter((w) => w.enabled).length;
  const totalRuns = workflows.reduce((s, w) => s + w.runs, 0);

  return (
    <div className="p-5 space-y-5 max-w-[1400px] mx-auto">
      {/* 顶部 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] data-mono text-phosphor-400/70 uppercase tracking-[0.25em] mb-1">
            /// AUTOMATION GRID
          </p>
          <h1 className="font-display font-bold text-2xl text-ink tracking-tight">
            工作流编排 ·{" "}
            <span className="text-phosphor-400 text-glow-phosphor">{enabledCount}</span>
            <span className="text-ink-faint text-lg">/{workflows.length}</span>
          </h1>
          <p className="text-[12px] text-ink-muted mt-1">
            {enabledCount} 条规则运行中 · 累计执行 {totalRuns} 次 · 跨舱跨接口联动
          </p>
        </div>
        <button className="btn-phosphor">
          <Plus className="w-3 h-3" strokeWidth={2} />
          新建规则
        </button>
      </div>

      {/* 规则列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {workflows.map((w, idx) => (
          <motion.div
            key={w.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={cn(
              "panel p-4 transition-all",
              w.enabled ? "border-phosphor-400/30" : "border-white/5 opacity-70"
            )}
          >
            {/* 头部 */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div
                  className={cn(
                    "w-8 h-8 shrink-0 flex items-center justify-center border clip-corner",
                    w.enabled
                      ? "border-phosphor-400/50 bg-phosphor-400/8 text-phosphor-400"
                      : "border-ink-faint/30 text-ink-faint"
                  )}
                >
                  <WorkflowIcon className="w-4 h-4" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-bold text-[13px] text-ink leading-tight">
                    {w.name}
                  </h3>
                  <p className="text-[9px] data-mono text-ink-faint uppercase tracking-wider mt-0.5">
                    {w.id.toUpperCase()} · RUNS {w.runs}
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggle(w.id)}
                className={cn(
                  "relative w-9 h-5 rounded-full transition-colors shrink-0",
                  w.enabled ? "bg-phosphor-400/30" : "bg-white/8"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                    w.enabled
                      ? "left-[20px] bg-phosphor-400 shadow-glow-phosphor"
                      : "left-0.5 bg-ink-muted"
                  )}
                />
              </button>
            </div>

            {/* 编排流程 */}
            <div className="space-y-2.5">
              {/* 触发器 */}
              <FlowNode
                kind="trigger"
                icon={Zap}
                label="触发器"
                value={`${w.trigger.source} · ${w.trigger.condition}`}
              />

              {/* 条件 */}
              {w.conditions.length > 0 && (
                <FlowNode
                  kind="condition"
                  icon={Filter}
                  label="条件"
                  value={w.conditions
                    .map((c) => `${c.field} ${c.op} "${c.value}"`)
                    .join("  AND  ")}
                />
              )}

              {/* 动作 */}
              {w.actions.map((a, i) => (
                <FlowNode
                  key={i}
                  kind="action"
                  icon={GitBranch}
                  label={`动作 ${i + 1}`}
                  value={`${a.type} → ${a.label}`}
                />
              ))}
            </div>

            {/* 底部 meta */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5 text-[10px] data-mono">
              <span className="flex items-center gap-1.5 text-ink-faint">
                {w.enabled ? (
                  <>
                    <Play className="w-2.5 h-2.5 text-jade" strokeWidth={1.5} />
                    <span className="text-jade">RUNNING</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-2.5 h-2.5 text-ink-faint" strokeWidth={1.5} />
                    <span>PAUSED</span>
                  </>
                )}
              </span>
              <span className="text-ink-faint">
                最近执行 {w.lastRun ? relativeTime(w.lastRun) : "—"}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 编排画布占位 */}
      <div className="panel h-[280px] relative overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-phosphor-400" strokeWidth={1.5} />
            <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
              编排画布 · BETA
            </h3>
          </div>
          <span className="text-[9px] data-mono text-ink-faint">DRAG NODES TO COMPOSE</span>
        </div>
        <div className="relative h-[calc(100%-42px)] bg-grid-faint bg-[length:24px_24px]">
          {/* 装饰节点 */}
          <div className="absolute left-8 top-8 px-3 py-2 border border-phosphor-400/50 bg-phosphor-400/10">
            <div className="flex items-center gap-2 text-[10px] font-display uppercase tracking-wider text-phosphor-400">
              <Zap className="w-3 h-3" strokeWidth={1.5} />
              触发器 · 邮件
            </div>
          </div>
          <ArrowRight className="absolute left-[140px] top-[26px] w-4 h-4 text-phosphor-400/50" strokeWidth={1.5} />
          <div className="absolute left-[180px] top-8 px-3 py-2 border border-amber-500/50 bg-amber-500/10">
            <div className="flex items-center gap-2 text-[10px] font-display uppercase tracking-wider text-amber-400">
              <Filter className="w-3 h-3" strokeWidth={1.5} />
              条件 · 优先级
            </div>
          </div>
          <ArrowRight className="absolute left-[300px] top-[26px] w-4 h-4 text-phosphor-400/50" strokeWidth={1.5} />
          <div className="absolute left-[340px] top-8 px-3 py-2 border border-violet/50 bg-violet/10">
            <div className="flex items-center gap-2 text-[10px] font-display uppercase tracking-wider text-violet">
              <GitBranch className="w-3 h-3" strokeWidth={1.5} />
              动作 · 建舱
            </div>
          </div>
          <div className="absolute left-[460px] top-8 px-3 py-2 border border-jade/50 bg-jade/10">
            <div className="flex items-center gap-2 text-[10px] font-display uppercase tracking-wider text-jade">
              <GitBranch className="w-3 h-3" strokeWidth={1.5} />
              动作 · 归集
            </div>
          </div>
          {/* 扫描线 */}
          <div className="absolute inset-0 bg-scanline opacity-20 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

function FlowNode({
  kind,
  icon: Icon,
  label,
  value,
}: {
  kind: "trigger" | "condition" | "action";
  icon: typeof Zap;
  label: string;
  value: string;
}) {
  const meta = {
    trigger: { color: "#FFB547", bg: "bg-amber-500/8", border: "border-amber-500/30" },
    condition: { color: "#9D8CFF", bg: "bg-violet/8", border: "border-violet/30" },
    action: { color: "#7FD1B9", bg: "bg-jade/8", border: "border-jade/30" },
  }[kind];

  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "px-2 py-1 text-[9px] font-display uppercase tracking-wider border shrink-0",
          meta.bg,
          meta.border
        )}
        style={{ color: meta.color }}
      >
        {label}
      </span>
      <Icon className="w-3 h-3 shrink-0" strokeWidth={1.5} style={{ color: meta.color }} />
      <span className="text-[11px] data-mono text-ink-muted truncate flex-1">{value}</span>
    </div>
  );
}
