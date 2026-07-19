import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, ChevronRight, Gauge, ListTodo, Radio } from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import StatStrip from "@/components/dashboard/StatStrip";
import FocusCard from "@/components/dashboard/FocusCard";
import OverdueRadar from "@/components/dashboard/OverdueRadar";
import AgentFeed from "@/components/dashboard/AgentFeed";
import ProgressRing from "@/components/ui/ProgressRing";
import { shortTime } from "@/lib/format";
import { usePreferences } from "@/i18n";
import { themeAccent } from "@/lib/theme";

export default function Dashboard() {
  const { text: t } = usePreferences();
  const folders = useMissionStore((s) => s.folders);
  const visibleFolders = folders.filter((folder) => folder.status !== "archived");
  const activities = useMissionStore((s) => s.agentActivities);

  // 今日焦点：1 大 + 3 小
  const activeFolders = visibleFolders
    .filter((f) => f.status === "active")
    .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));
  const hero = activeFolders[0];
  const minis = activeFolders.slice(1, 4);

  // 全局进度
  const globalProgress = Math.round(
    visibleFolders.reduce((s, f) => s + f.progress, 0) / Math.max(visibleFolders.length, 1)
  );
  const totalTodos = visibleFolders.reduce((s, f) => s + f.todos.length, 0);
  const doneTodos = visibleFolders.reduce(
    (s, f) => s + f.todos.filter((t) => t.done).length,
    0
  );

  // 分舱进度段
  const segments = activeFolders.slice(0, 6).map((f) => ({
    value: f.progress,
    color: themeAccent(f.coverColor),
  }));

  return (
    <div className="p-5 space-y-4 max-w-[1400px] mx-auto">
      {/* 顶部欢迎条 */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-4 flex-wrap"
      >
        <div>
          <p className="text-[10px] data-mono text-phosphor-400/70 uppercase tracking-[0.25em] mb-1">
            /// MISSION BRIEFING · {shortTime(Date.now())}
          </p>
          <h1 className="font-display font-bold text-2xl text-ink tracking-tight">
            {t("指挥中心", "Command center")} ·{" "}
            <span className="text-phosphor-400 text-glow-phosphor">ONLINE</span>
          </h1>
          <p className="text-[12px] text-ink-muted mt-1">
            {t(
              `当前 ${activeFolders.length} 个舱体活跃，${activities.length} 条 Agent 事件待审。建议优先处理今日截止事项。`,
              `${activeFolders.length} active folders and ${activities.length} Agent events are awaiting review. Prioritize today's deadlines.`,
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost">
            <Radio className="w-3 h-3" strokeWidth={1.5} />
            {t("同步", "Sync")}
          </button>
          <Link to="/folders?create=1" className="btn-phosphor">
            <Plus className="w-3 h-3" strokeWidth={2} />
            {t("新建舱体", "New folder")}
          </Link>
        </div>
      </motion.div>

      {/* 统计条 */}
      <StatStrip folders={visibleFolders} activities={activities} />

      {/* 主网格：今日焦点（左大）+ 进度环 + 逾期雷达 */}
      <div className="grid grid-cols-12 gap-4">
        {/* 今日焦点 */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListTodo className="w-3.5 h-3.5 text-phosphor-400" strokeWidth={1.5} />
              <h2 className="font-display text-[12px] uppercase tracking-[0.2em] text-ink">
                {t("今日焦点", "Today’s focus")} · TODAY FOCUS
              </h2>
            </div>
            <Link
              to="/folders"
              className="flex items-center gap-1 text-[10px] data-mono text-ink-faint hover:text-phosphor-400 transition-colors"
            >
              {t("查看全部", "View all")} <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
            </Link>
          </div>

          {hero && (
            <div className="h-[180px]">
              <FocusCard folder={hero} variant="hero" />
            </div>
          )}

          {minis.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {minis.map((f) => (
                <div key={f.id} className="h-[150px]">
                  <FocusCard folder={f} variant="mini" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：进度环 + 逾期雷达 */}
        <div className="col-span-12 lg:col-span-5 grid grid-rows-2 gap-4">
          {/* 进度环 */}
          <div className="panel p-5 flex items-center gap-6">
            <div className="absolute top-0 left-8% right-8% h-px" />
            <div className="flex items-center gap-6 w-full">
              <ProgressRing
                progress={globalProgress}
                size={140}
                stroke={10}
                segments={segments}
                showLabel={false}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="w-3.5 h-3.5 text-phosphor-400" strokeWidth={1.5} />
                  <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
                    {t("全局进度", "Overall progress")}
                  </h3>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="font-display font-bold text-4xl text-phosphor-400 text-glow-phosphor data-mono leading-none">
                    {globalProgress}
                    <span className="text-xl">%</span>
                  </span>
                  <span className="text-[10px] data-mono text-ink-faint">
                    {doneTodos}/{totalTodos} TODOS
                  </span>
                </div>
                <div className="space-y-1">
                  {activeFolders.slice(0, 4).map((f) => (
                    <Link
                      key={f.id}
                      to={`/folders/${f.id}`}
                      className="flex items-center gap-2 text-[10px] hover:bg-white/3 px-1 py-0.5 transition-colors"
                    >
                      <span
                        className="w-1.5 h-1.5 shrink-0"
                        style={{ background: themeAccent(f.coverColor) }}
                      />
                      <span className="flex-1 text-ink-muted truncate">{f.name}</span>
                      <span className="data-mono text-ink-faint">{f.progress}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 逾期雷达 */}
          <div className="panel">
            <OverdueRadar folders={folders} />
          </div>
        </div>
      </div>

      {/* Agent 活动流 + 接口流量 */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 panel h-[320px]">
          <AgentFeed activities={activities} />
        </div>
        <div className="col-span-12 lg:col-span-4 panel h-[320px] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 bg-phosphor-400 animate-pulse-dot" />
              <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
                {t("接口流量", "Integration traffic")} · 24H
              </h3>
            </div>
            <Link
              to="/integrations"
              className="text-[10px] data-mono text-ink-faint hover:text-phosphor-400"
            >
              {t("管理", "Manage")} →
            </Link>
          </div>
          <InterfaceBars />
        </div>
      </div>
    </div>
  );
}

// 接口流量迷你条形图（自绘）
function InterfaceBars() {
  const integrations = useMissionStore((s) => s.integrations);
  const connected = integrations.filter((i) => i.eventsToday > 0 || i.status === "connected");
  const max = Math.max(...connected.map((i) => i.eventsToday), 1);

  return (
    <div className="space-y-2.5">
      {connected.slice(0, 6).map((i) => {
        const pct = (i.eventsToday / max) * 100;
        const color =
          i.type === "email"
            ? "#00E5D4"
            : i.type === "chat"
              ? "#9D8CFF"
              : i.type === "calendar"
                ? "#FFB547"
                : "#7FD1B9";
        return (
          <div key={i.id} className="flex items-center gap-3">
            <span className="text-[10px] data-mono text-ink-muted w-16 truncate shrink-0">
              {i.name}
            </span>
            <div className="flex-1 h-4 bg-white/3 relative overflow-hidden">
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: `linear-gradient(90deg, ${color}55, ${color})`,
                  boxShadow: `0 0 8px ${color}66`,
                }}
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] data-mono text-ink">
                {i.eventsToday}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
