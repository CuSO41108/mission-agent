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
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { relativeTime, shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";
import { buildAgentActivities, isAgentOnline, isVisibleFolder } from "@/lib/missionStats";

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
  const managedFolders = folders.filter(isVisibleFolder);
  const activeAgents = managedFolders.filter(isAgentOnline);
  const activities = buildAgentActivities(managedFolders);
  const totalActions = activities.length;
  const strategies = [
    { key: "follow_up", label: t("每日跟进", "Daily follow-up"), desc: t("检查截止时间与停滞事项，按权限发送应用内提醒。", "Check deadlines and stalled work, then send permitted in-app reminders.") },
    { key: "material_collect", label: t("材料归集", "Material collection"), desc: t("检查并整理任务舱内已经挂载的本地材料。", "Review and organize local materials already attached to the folder.") },
    { key: "progress_sync", label: t("进度播报", "Progress digest"), desc: t("根据真实待办和时间线生成本地进度摘要。", "Create a local progress digest from real todos and timeline entries.") },
    { key: "custom", label: t("自定义规则", "Custom rule"), desc: t("按照已配置的本地工作流执行任务。", "Run tasks through a configured local workflow.") },
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
          <p className="text-[11px] text-ink-faint mb-1">
            {t("自动执行与记录", "Automation and history")}
          </p>
          <h1 className="font-display font-semibold text-2xl text-ink">
            Agent <span className="text-ink-faint">{activeAgents.length}</span>
          </h1>
          <p className="text-[12px] text-ink-muted mt-1">
            {t(
              `${activeAgents.length} 个 Agent 在线 · 数据库记录 ${totalActions} 次 Agent 动作`,
              `${activeAgents.length} Agents online · ${totalActions} Agent actions recorded in the database`,
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* 左：Agent 舰队 */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <div className="panel">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-phosphor-400" />
                <h3 className="font-display text-[11px] font-semibold text-ink">
                  {t("Agent 列表", "Agents")}
                </h3>
              </div>
              <span className="text-[9px] data-mono text-ink-faint">
                {activeAgents.length} ACTIVE / {managedFolders.length} TOTAL
              </span>
            </div>
            <div className="p-3 space-y-2">
              {managedFolders.map((f, idx) => {
                const online = isAgentOnline(f);
                const stateLabel = online ? "ACTIVE" : f.agentConfig.enabled ? f.status.toUpperCase() : "STANDBY";
                return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 border transition-all",
                    online
                      ? "border-phosphor-400/25 bg-phosphor-400/3"
                      : "border-white/5 opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "relative w-8 h-8 flex items-center justify-center border rounded shrink-0",
                      online
                        ? "border-phosphor-400/50 bg-phosphor-400/8"
                        : "border-ink-faint/30"
                    )}
                  >
                    <Bot
                      className={cn("w-3.5 h-3.5", online ? "text-phosphor-400" : "text-ink-faint")}
                      strokeWidth={1.5}
                    />
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
                      online
                        ? "border-jade/40 text-jade bg-jade/5"
                        : "border-ink-faint/30 text-ink-faint"
                    )}
                  >
                    {stateLabel}
                  </span>
                </motion.div>
                );
              })}
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
                  className="px-3 py-2.5 border border-white/5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-ink">{s.label}</span>
                    <span className="text-[9px] data-mono text-phosphor-400">
                      {managedFolders.filter((folder) => folder.agentConfig.strategy === s.key).length} {t("个舱体", "folders")}
                    </span>
                  </div>
                  <p className="text-[10px] text-ink-faint leading-snug">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右：真实 Agent 运行记录 */}
        <div className="col-span-12 lg:col-span-5 panel flex flex-col h-[calc(100vh-200px)] sticky top-4 self-start">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-violet" strokeWidth={1.5} />
              <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
                {t("运行记录", "Run history")} · LOCAL DB
              </h3>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {activities.map((log) => {
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
                      <span>· {log.folderName}</span>
                      <span>· {shortTime(log.timestamp)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {activities.length === 0 && (
              <div className="h-full min-h-40 flex items-center justify-center text-center text-[11px] text-ink-faint px-6">
                {t("暂无 Agent 运行记录。执行后会从本地时间线显示在这里。", "No Agent run history yet. Runs will appear here from the local timeline.")}
              </div>
            )}
          </div>
          <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-[9px] data-mono text-ink-faint">
            <span className="flex items-center gap-1.5">
              <Activity className="w-2.5 h-2.5 text-jade" strokeWidth={1.5} />
              {t("来源：本地任务舱时间线", "Source: local folder timelines")}
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-2.5 h-2.5 text-jade" strokeWidth={1.5} />
              {activities.length} ENTRIES
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
