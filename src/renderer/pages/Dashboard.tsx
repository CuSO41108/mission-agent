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
import {
  activitiesInLast24Hours,
  buildAgentActivities,
  countTodos,
} from "@/lib/missionStats";

export default function Dashboard() {
  const { text: t } = usePreferences();
  const folders = useMissionStore((s) => s.folders);
  const visibleFolders = folders.filter((folder) => folder.status !== "archived");
  const activities = activitiesInLast24Hours(buildAgentActivities(visibleFolders));

  // 今日焦点：1 大 + 3 小
  const activeFolders = visibleFolders
    .filter((f) => f.status === "active")
    .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));
  const hero = activeFolders[0];
  const minis = activeFolders.slice(1, 4);

  // 全局进度
  const todoCounts = visibleFolders.reduce(
    (total, folder) => {
      const folderCounts = countTodos(folder.todos);
      return { total: total.total + folderCounts.total, done: total.done + folderCounts.done };
    },
    { total: 0, done: 0 },
  );
  const totalTodos = todoCounts.total;
  const doneTodos = todoCounts.done;
  const globalProgress = Math.round((doneTodos / Math.max(totalTodos, 1)) * 100);

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
          <p className="text-[11px] text-ink-faint mb-1">
            {t("今日概览", "Today’s overview")} · {shortTime(Date.now())}
          </p>
          <h1 className="font-display font-semibold text-2xl text-ink">
            {t("指挥中心", "Command center")}
          </h1>
          <p className="text-[12px] text-ink-muted mt-1">
            {t(
              `当前 ${activeFolders.length} 个舱体活跃，过去 24 小时有 ${activities.length} 条 Agent 运行记录。建议优先处理今日截止事项。`,
              `${activeFolders.length} active folders and ${activities.length} Agent events in the last 24 hours. Prioritize today's deadlines.`,
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
              <h2 className="font-display text-[12px] font-semibold text-ink">
                {t("今日焦点", "Today’s focus")}
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
            <div className="min-h-[210px]">
              <FocusCard folder={hero} variant="hero" />
            </div>
          )}

          {!hero && (
            <div className="panel min-h-[380px] flex flex-col items-center justify-center text-center px-6">
              <div className="w-10 h-10 rounded bg-obsidian-850 border border-obsidian-700 flex items-center justify-center mb-3">
                <ListTodo className="w-4 h-4 text-ink-faint" strokeWidth={1.75} />
              </div>
              <p className="text-[13px] font-medium text-ink">
                {t("今天还没有需要处理的任务", "Nothing needs attention today")}
              </p>
              <p className="text-[11px] text-ink-faint mt-1 mb-4">
                {t("新建任务舱后，近期事项会显示在这里", "Upcoming work will appear here after you create a folder")}
              </p>
              <Link to="/folders?create=1" className="btn-ghost">
                <Plus className="w-3 h-3" strokeWidth={2} />
                {t("新建任务舱", "New folder")}
              </Link>
            </div>
          )}

          {minis.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
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
                  <h3 className="font-display text-[11px] font-semibold text-ink">
                    {t("全部任务舱待办进度", "Todo progress across folders")}
                  </h3>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="font-display font-semibold text-4xl text-ink data-mono leading-none">
                    {globalProgress}
                    <span className="text-xl">%</span>
                  </span>
                  <span className="text-[10px] data-mono text-ink-faint">
                    {doneTodos}/{totalTodos} TODOS
                  </span>
                </div>
                <p className="text-[9px] leading-relaxed text-ink-faint mb-2">
                  {t("按所有未归档任务舱的待办计算，不代表 Agent 正在运行。", "Calculated from todos in all unarchived folders; it does not indicate that an Agent is running.")}
                </p>
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
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor-400" />
              <h3 className="font-display text-[11px] font-semibold text-ink">
                {t("接口流量", "Integration traffic")} · 24h
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
            ? "rgb(var(--phosphor-400))"
            : i.type === "chat"
              ? "rgb(var(--violet))"
              : i.type === "calendar"
                ? "rgb(var(--amber-500))"
                : "rgb(var(--jade))";
        return (
          <div key={i.id} className="flex items-center gap-3">
            <span className="text-[10px] data-mono text-ink-muted w-16 truncate shrink-0">
              {i.name}
            </span>
            <div className="flex-1 h-4 bg-obsidian-850 rounded-sm relative overflow-hidden">
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: color,
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
