import {
  Mail,
  Calendar,
  MessageSquare,
  Send,
  Slack,
  Hash,
  Plug,
  Plus,
  Activity,
  Settings,
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import StatusDot from "@/components/ui/StatusDot";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IntegrationAdapter, IntegrationType } from "@/types";

const TYPE_ICON: Record<IntegrationType, typeof Mail> = {
  email: Mail,
  calendar: Calendar,
  social: MessageSquare,
  chat: Send,
  custom: Plug,
};

const TYPE_COLOR: Record<IntegrationType, string> = {
  email: "#00E5D4",
  calendar: "#FFB547",
  social: "#9D8CFF",
  chat: "#7FD1B9",
  custom: "#8B98A5",
};

const STATUS_LABEL: Record<string, string> = {
  connected: "已连接",
  disconnected: "未连接",
  error: "异常",
  beta: "测试中",
};

export default function Integrations() {
  const integrations = useMissionStore((s) => s.integrations);
  const toggle = useMissionStore((s) => s.toggleIntegration);

  const connected = integrations.filter((i) => i.status === "connected").length;
  const totalEvents = integrations.reduce((s, i) => s + i.eventsToday, 0);

  return (
    <div className="p-5 space-y-5 max-w-[1400px] mx-auto">
      {/* 顶部 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] data-mono text-phosphor-400/70 uppercase tracking-[0.25em] mb-1">
            /// INTERFACE BAY
          </p>
          <h1 className="font-display font-bold text-2xl text-ink tracking-tight">
            接口舱 ·{" "}
            <span className="text-phosphor-400 text-glow-phosphor">{connected}</span>
            <span className="text-ink-faint text-lg">/{integrations.length}</span>
          </h1>
          <p className="text-[12px] text-ink-muted mt-1">
            已接入 {connected} 个接口 · 今日事件 {totalEvents} 条 · 可扩展适配器插槽就绪
          </p>
        </div>
        <button className="btn-phosphor">
          <Plus className="w-3 h-3" strokeWidth={2} />
          注册适配器
        </button>
      </div>

      {/* 接口卡片墙 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {integrations.map((i) => (
          <IntegrationCard key={i.id} integration={i} onToggle={() => toggle(i.id)} />
        ))}

        {/* 通用插槽占位 */}
        {[1, 2].map((n) => (
          <div
            key={`slot-${n}`}
            className="flex flex-col items-center justify-center h-[200px] border border-dashed border-phosphor-400/15 text-ink-faint hover:border-phosphor-400/40 hover:text-phosphor-400 hover:bg-phosphor-400/3 transition-all cursor-pointer"
          >
            <div className="w-10 h-10 border border-phosphor-400/30 flex items-center justify-center mb-2 clip-corner">
              <Plus className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <p className="text-[11px] font-display uppercase tracking-wider">通用插槽 #{n}</p>
            <p className="text-[9px] data-mono mt-1">ADAPTER SLOT</p>
          </div>
        ))}
      </div>

      {/* 同步日志 */}
      <div className="panel h-[260px] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-phosphor-400" strokeWidth={1.5} />
            <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
              同步日志 · 最近 24H
            </h3>
          </div>
          <span className="text-[9px] data-mono text-ink-faint">SYNC LOG</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-[11px]">
          {generateSyncLog(integrations).map((line, idx) => (
            <div key={idx} className="flex items-center gap-2 px-2 py-1 hover:bg-white/3 transition-colors">
              <span className="text-ink-faint shrink-0">{line.time}</span>
              <span
                className={cn(
                  "shrink-0 uppercase tracking-wider",
                  line.type === "OK" ? "text-jade" : line.type === "WARN" ? "text-amber-400" : "text-phosphor-400"
                )}
              >
                {line.type}
              </span>
              <span className="text-phosphor-400/70 shrink-0">[{line.source}]</span>
              <span className="text-ink-muted truncate">{line.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({
  integration,
  onToggle,
}: {
  integration: IntegrationAdapter;
  onToggle: () => void;
}) {
  const Icon = TYPE_ICON[integration.type];
  const color = TYPE_COLOR[integration.type];
  const isConn = integration.status === "connected";

  return (
    <div
      className={cn(
        "panel p-4 relative overflow-hidden flex flex-col h-[200px] transition-all",
        "hover:border-phosphor-400/40"
      )}
      style={{ borderColor: isConn ? `${color}30` : "rgba(255,255,255,0.08)" }}
    >
      {/* 背景角标 */}
      <Icon
        className="absolute -right-3 -bottom-3 w-20 h-20 opacity-[0.04]"
        strokeWidth={1}
        style={{ color }}
      />

      <div className="flex items-start justify-between mb-3 relative">
        <div
          className="w-10 h-10 flex items-center justify-center border clip-corner"
          style={{
            borderColor: `${color}50`,
            backgroundColor: `${color}10`,
          }}
        >
          <Icon className="w-4.5 h-4.5" strokeWidth={1.5} style={{ color }} />
        </div>
        <StatusDot status={integration.status} pulse={isConn} />
      </div>

      <div className="relative flex-1">
        <h3 className="font-display font-bold text-[14px] text-ink leading-tight mb-1">
          {integration.name}
        </h3>
        <p className="text-[10px] data-mono text-ink-faint uppercase tracking-wider mb-2">
          {integration.type.toUpperCase()} · {integration.id.toUpperCase()}
        </p>
        <p className="text-[11px] text-ink-muted leading-snug line-clamp-2">
          {integration.description}
        </p>
      </div>

      <div className="relative flex items-center justify-between pt-3 mt-auto border-t border-white/5">
        <div className="flex flex-col">
          <span className="text-[9px] data-mono text-ink-faint uppercase">最近同步</span>
          <span className="text-[10px] data-mono text-ink-muted">
            {integration.lastSync ? relativeTime(integration.lastSync) : "—"}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] data-mono text-ink-faint uppercase">今日事件</span>
          <span
            className="text-[12px] data-mono font-bold"
            style={{ color: isConn ? color : "#5C6773" }}
          >
            {integration.eventsToday}
          </span>
        </div>
      </div>

      <div className="relative flex items-center gap-2 mt-2">
        <button
          onClick={onToggle}
          className={cn(
            "flex-1 py-1.5 text-[10px] font-display uppercase tracking-wider border transition-all",
            isConn
              ? "border-coral/40 text-coral hover:bg-coral/10"
              : "border-phosphor-400/40 text-phosphor-400 hover:bg-phosphor-400/10"
          )}
        >
          {isConn ? "断开" : "连接"}
        </button>
        <button className="px-2 py-1.5 border border-white/8 text-ink-faint hover:text-ink hover:border-white/15 transition-colors">
          <Settings className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function generateSyncLog(integrations: IntegrationAdapter[]) {
  const now = new Date();
  const log: { time: string; type: string; source: string; msg: string }[] = [];
  const templates = [
    { type: "OK", msg: "拉取完成，{n} 条新事件已入库" },
    { type: "OK", msg: "推送进度更新至 {target}" },
    { type: "WARN", msg: "速率接近上限（{n}/min）" },
    { type: "OK", msg: "OAuth 令牌已自动刷新" },
    { type: "INFO", msg: "Agent 触发同步，等待响应" },
  ];
  for (let i = 0; i < 14; i++) {
    const t = new Date(now.getTime() - i * 7 * 60000);
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    const ss = String(t.getSeconds()).padStart(2, "0");
    const tpl = templates[i % templates.length];
    const src = integrations[i % integrations.length];
    const msg = tpl.msg
      .replace("{n}", String(Math.floor(Math.random() * 30) + 1))
      .replace("{target}", src.name);
    log.push({
      time: `${hh}:${mm}:${ss}`,
      type: tpl.type,
      source: src.id.replace("int-", "").toUpperCase(),
      msg,
    });
  }
  return log;
}
