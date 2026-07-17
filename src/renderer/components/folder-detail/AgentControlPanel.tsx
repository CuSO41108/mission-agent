import {
  Bot,
  Power,
  Shield,
  Activity,
  Zap,
  Eye,
  PencilLine,
  Bell,
  ListPlus,
} from "lucide-react";
import type { AgentConfig } from "@/types";
import { useMissionStore } from "@/store/useMissionStore";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";

interface AgentControlPanelProps {
  folderId: string;
  config: AgentConfig;
}

export default function AgentControlPanel({ folderId, config }: AgentControlPanelProps) {
  const { locale, text: t } = usePreferences();
  const toggleAgent = useMissionStore((s) => s.toggleAgent);
  const strategies: { key: AgentConfig["strategy"]; label: string; desc: string }[] = [
    { key: "follow_up", label: t("跟进催办", "Follow up"), desc: t("在截止前主动提醒并推进", "Remind and move work forward before deadlines.") },
    { key: "material_collect", label: t("材料归集", "Collect materials"), desc: t("从接口拉取相关材料入库", "Collect related material from integrations.") },
    { key: "progress_sync", label: t("进度同步", "Sync progress"), desc: t("定期同步进度至接口", "Sync progress to integrations on a schedule.") },
    { key: "custom", label: t("自定义", "Custom"), desc: t("按工作流规则执行", "Run according to workflow rules.") },
  ];
  const permissions = [
    { key: "read", label: t("读取", "Read"), icon: Eye },
    { key: "write", label: t("写入", "Write"), icon: PencilLine },
    { key: "notify", label: t("通知", "Notify"), icon: Bell },
    { key: "create_subtask", label: t("建子任务", "Create subtask"), icon: ListPlus },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "relative w-6 h-6 flex items-center justify-center border",
              config.enabled
                ? "border-phosphor-400/50 bg-phosphor-400/10"
                : "border-ink-faint/30 bg-white/3"
            )}
          >
            <Bot
              className={cn("w-3 h-3", config.enabled ? "text-phosphor-400" : "text-ink-faint")}
              strokeWidth={1.5}
            />
            {config.enabled && (
              <span className="absolute inset-0 bg-scanline opacity-20 animate-flicker" />
            )}
          </div>
          <div>
            <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink leading-none">
              {t("Agent 托管", "Agent control")}
            </h3>
            <p className="text-[9px] data-mono mt-1 leading-none flex items-center gap-1">
              <span
                className={cn(
                  "w-1 h-1",
                  config.enabled ? "bg-jade animate-pulse-dot" : "bg-ink-faint"
                )}
              />
              <span className={config.enabled ? "text-jade" : "text-ink-faint"}>
                {config.enabled ? "ACTIVE" : "STANDBY"}
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={() => toggleAgent(folderId)}
          className={cn(
            "relative w-10 h-5 rounded-full transition-colors",
            config.enabled ? "bg-phosphor-400/30" : "bg-white/8"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 w-4 h-4 rounded-full transition-all",
              config.enabled
                ? "left-[22px] bg-phosphor-400 shadow-glow-phosphor"
                : "left-0.5 bg-ink-muted"
            )}
          />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 策略选择 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3 h-3 text-amber-400" strokeWidth={1.5} />
            <span className="font-display text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              {t("托管策略", "Control strategy")}
            </span>
          </div>
          <div className="space-y-1">
            {strategies.map((s) => {
              const active = config.strategy === s.key;
              return (
                <button
                  key={s.key}
                  disabled={!config.enabled}
                  className={cn(
                    "w-full text-left px-3 py-2 border transition-all",
                    !config.enabled && "opacity-40 cursor-not-allowed",
                    active
                      ? "border-phosphor-400/40 bg-phosphor-400/8"
                      : "border-white/5 hover:border-phosphor-400/25 hover:bg-white/3"
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={cn(
                        "text-[12px] font-medium",
                        active ? "text-phosphor-100" : "text-ink"
                      )}
                    >
                      {s.label}
                    </span>
                    {active && <Power className="w-3 h-3 text-phosphor-400" strokeWidth={1.5} />}
                  </div>
                  <p className="text-[10px] text-ink-faint leading-snug">{s.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 权限边界 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="w-3 h-3 text-violet" strokeWidth={1.5} />
            <span className="font-display text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              {t("权限边界", "Permissions")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {permissions.map((p) => {
              const on = config.permissions[p.key];
              return (
                <div
                  key={p.key}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 border",
                    on
                      ? "border-phosphor-400/30 bg-phosphor-400/5"
                      : "border-white/5 opacity-50"
                  )}
                >
                  <p.icon
                    className={cn("w-3 h-3", on ? "text-phosphor-400" : "text-ink-faint")}
                    strokeWidth={1.5}
                  />
                  <span className="text-[10px] text-ink-muted">{p.label}</span>
                  <span
                    className={cn(
                      "ml-auto w-1.5 h-1.5 rounded-full",
                      on ? "bg-phosphor-400" : "bg-ink-faint"
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 最近动作 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3 h-3 text-jade" strokeWidth={1.5} />
            <span className="font-display text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              {t("最近动作", "Latest action")}
            </span>
          </div>
          <div className="px-3 py-2 border border-white/5 bg-obsidian-950/40">
            {config.lastAction ? (
              <>
                <p className="text-[11px] text-ink leading-snug">
                  {config.strategy === "follow_up"
                    ? t("已发送跟进提醒，等待响应", "A follow-up reminder was sent; awaiting a response.")
                    : config.strategy === "material_collect"
                      ? t("已从邮件接口归集 2 份材料", "Collected 2 materials from the email integration.")
                      : config.strategy === "progress_sync"
                        ? t("已同步进度至飞书群", "Progress was synced to the Feishu group.")
                        : t("已执行自定义规则", "Custom rule completed.")}
                </p>
                <p className="text-[9px] data-mono text-ink-faint mt-1">
                  {relativeTime(config.lastAction, locale)}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-ink-faint">{t("尚无动作记录", "No actions recorded yet")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
