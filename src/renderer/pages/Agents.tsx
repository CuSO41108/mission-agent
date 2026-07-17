import { motion } from "framer-motion";
import {
  Bot,
  Zap,
  Eye,
  PencilLine,
  Bell,
  ListPlus,
  Shield,
  Activity,
  CheckCircle2,
  RotateCcw,
  Cpu,
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { relativeTime, shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";

const AUDIT_LOG = [
  { id: 1, time: Date.now() - 22 * 60000, action: "Agent「Q3 财务复盘」拉取 Stripe 对账单", type: "sync", actor: "f-001" },
  { id: 2, time: Date.now() - 2 * 3600000, action: "Agent「新品发布」草拟 4 渠道文案", type: "create", actor: "f-002" },
  { id: 3, time: Date.now() - 3 * 3600000, action: "Agent「Q3 财务复盘」通知财务确认", type: "notify", actor: "f-001" },
  { id: 4, time: Date.now() - 5 * 3600000, action: "Agent「健身计划」推送饮食记录提醒", type: "warn", actor: "f-006" },
  { id: 5, time: Date.now() - 8 * 3600000, action: "Agent「周会」归档会议纪要", type: "update", actor: "f-004" },
  { id: 6, time: Date.now() - 12 * 3600000, action: "Agent「新品发布」同步进度至飞书", type: "sync", actor: "f-002" },
];

const TYPE_COLOR: Record<string, string> = {
  sync: "rgb(var(--phosphor-400))",
  create: "rgb(var(--violet))",
  notify: "rgb(var(--amber-500))",
  update: "rgb(var(--jade))",
  warn: "rgb(var(--coral))",
};

export default function Agents() {
  const { locale, text: t } = usePreferences();
  const folders = useMissionStore((s) => s.folders);
  const activeAgents = folders.filter((f) => f.agentConfig.enabled);
  const totalActions = folders.reduce(
    (s, f) => s + f.timeline.filter((t) => t.actor === "agent").length,
    0
  );
  const strategies = [
    { key: "follow_up", label: t("每日跟进", "Daily follow-up"), desc: t("在每个舱体截止前主动提醒，滚动推进待办", "Proactively remind before deadlines and advance todos."), runs: 142 },
    { key: "material_collect", label: t("材料归集", "Material collection"), desc: t("从邮件/社交接口拉取相关材料并归类入库", "Collect relevant material from email and social integrations."), runs: 87 },
    { key: "progress_sync", label: t("进度播报", "Progress digest"), desc: t("每日固定时间同步进度至接口与副驾面板", "Sync progress to integrations and the copilot at a set time."), runs: 36 },
    { key: "custom", label: t("自定义规则", "Custom rule"), desc: t("按工作流规则组合执行，含跨舱联动", "Compose workflow rules, including cross-folder actions."), runs: 12 },
  ];
  const permissions = [
    { key: "read", label: t("读取", "Read"), icon: Eye },
    { key: "write", label: t("写入", "Write"), icon: PencilLine },
    { key: "notify", label: t("通知", "Notify"), icon: Bell },
    { key: "create_subtask", label: t("建子任务", "Create subtask"), icon: ListPlus },
  ] as const;

  return (
    <div className="p-5 space-y-5 max-w-[1400px] mx-auto">
      {/* 顶部 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] data-mono text-phosphor-400/70 uppercase tracking-[0.25em] mb-1">
            /// AGENT CONTROL CENTER
          </p>
          <h1 className="font-display font-bold text-2xl text-ink tracking-tight">
            {t("Agent 控制台", "Agent console")} ·{" "}
            <span className="text-phosphor-400 text-glow-phosphor">{activeAgents.length}</span>
            <span className="text-ink-faint text-lg"> ONLINE</span>
          </h1>
          <p className="text-[12px] text-ink-muted mt-1">
            {t(
              `${activeAgents.length} 个 Agent 在线 · 累计执行 ${totalActions} 次自主动作 · 全程审计可回滚`,
              `${activeAgents.length} Agents online · ${totalActions} autonomous actions · all changes are auditable and reversible`,
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-phosphor-400/20 bg-obsidian-850/60">
            <Cpu className="w-3 h-3 text-phosphor-400" strokeWidth={1.5} />
            <span className="text-[10px] data-mono text-phosphor-400">CPU 42% · MEM 1.2G</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* 左：Agent 舰队 */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <div className="panel">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 bg-phosphor-400 animate-pulse-dot" />
                <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
                  {t("Agent 舰队", "Agent fleet")} · FLEET
                </h3>
              </div>
              <span className="text-[9px] data-mono text-ink-faint">
                {activeAgents.length} ACTIVE / {folders.length} TOTAL
              </span>
            </div>
            <div className="p-3 space-y-2">
              {folders.map((f, idx) => (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 border transition-all",
                    f.agentConfig.enabled
                      ? "border-phosphor-400/25 bg-phosphor-400/3"
                      : "border-white/5 opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "relative w-8 h-8 flex items-center justify-center border shrink-0",
                      f.agentConfig.enabled
                        ? "border-phosphor-400/50 bg-phosphor-400/8"
                        : "border-ink-faint/30"
                    )}
                  >
                    <Bot
                      className={cn("w-3.5 h-3.5", f.agentConfig.enabled ? "text-phosphor-400" : "text-ink-faint")}
                      strokeWidth={1.5}
                    />
                    {f.agentConfig.enabled && (
                      <span className="absolute inset-0 bg-scanline opacity-20 animate-flicker" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-ink truncate">{f.name}</p>
                    <p className="text-[9px] data-mono text-ink-faint mt-0.5">
                      STRATEGY: {f.agentConfig.strategy.toUpperCase()}
                      {f.agentConfig.lastAction && ` · LAST: ${relativeTime(f.agentConfig.lastAction, locale)}`}
                    </p>
                  </div>
                  {/* 权限指示 */}
                  <div className="flex items-center gap-1 shrink-0">
                    {permissions.map((p) => {
                      const on = f.agentConfig.permissions[p.key];
                      return (
                        <span
                          key={p.key}
                          title={p.label}
                          className={cn(
                            "w-5 h-5 flex items-center justify-center border",
                            on
                              ? "border-phosphor-400/30 bg-phosphor-400/5 text-phosphor-400"
                              : "border-white/5 text-ink-faint/40"
                          )}
                        >
                          <p.icon className="w-2.5 h-2.5" strokeWidth={1.5} />
                        </span>
                      );
                    })}
                  </div>
                  <span
                    className={cn(
                      "chip shrink-0",
                      f.agentConfig.enabled
                        ? "border-jade/40 text-jade bg-jade/5"
                        : "border-ink-faint/30 text-ink-faint"
                    )}
                  >
                    {f.agentConfig.enabled ? "ACTIVE" : "STANDBY"}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 策略库 */}
          <div className="panel">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-amber-400" strokeWidth={1.5} />
                <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
                  {t("策略库", "Strategy presets")} · STRATEGY PRESETS
                </h3>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3">
              {strategies.map((s) => (
                <div
                  key={s.key}
                  className="px-3 py-2.5 border border-white/5 hover:border-phosphor-400/30 hover:bg-phosphor-400/3 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-ink">{s.label}</span>
                    <span className="text-[9px] data-mono text-phosphor-400">{s.runs}x</span>
                  </div>
                  <p className="text-[10px] text-ink-faint leading-snug">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右：审计日志 */}
        <div className="col-span-12 lg:col-span-5 panel flex flex-col h-[calc(100vh-200px)] sticky top-4 self-start">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-violet" strokeWidth={1.5} />
              <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
                {t("审计日志", "Audit log")} · AUDIT
              </h3>
            </div>
            <button className="flex items-center gap-1 text-[9px] data-mono text-ink-faint hover:text-phosphor-400 transition-colors">
              <RotateCcw className="w-2.5 h-2.5" strokeWidth={1.5} />
              ROLLBACK
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {AUDIT_LOG.map((log) => {
              const color = TYPE_COLOR[log.type];
              return (
                <div
                  key={log.id}
                  className="group flex items-start gap-2.5 px-2.5 py-2 border border-white/5 hover:border-phosphor-400/25 hover:bg-white/3 transition-all"
                >
                  <span
                    className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full"
                    style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-ink leading-snug">{log.action}</p>
                    <div className="flex items-center gap-2 mt-1 text-[9px] data-mono text-ink-faint">
                      <span style={{ color }}>{log.type.toUpperCase()}</span>
                      <span>· {log.actor.toUpperCase()}</span>
                      <span>· {shortTime(log.time)}</span>
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 text-[9px] data-mono text-coral hover:underline transition-opacity">
                    {t("回滚", "Rollback")}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-[9px] data-mono text-ink-faint">
            <span className="flex items-center gap-1.5">
              <Activity className="w-2.5 h-2.5 text-jade" strokeWidth={1.5} />
              {t("完整性校验通过", "Integrity check passed")}
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-2.5 h-2.5 text-jade" strokeWidth={1.5} />
              {AUDIT_LOG.length} ENTRIES
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
