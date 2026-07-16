import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, LayoutGrid, List, Filter } from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import FolderCard from "@/components/folders/FolderCard";
import { PRIORITY_LABEL, countdown, STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskFolder } from "@/types";

type StatusFilter = "all" | "active" | "paused" | "done";
type ViewMode = "grid" | "list";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "paused", label: "暂停" },
  { key: "done", label: "已完成" },
];

function FolderRow({ folder }: { folder: TaskFolder }) {
  const cd = countdown(folder.deadline);
  const doneTodos = folder.todos.filter((t) => t.done).length;
  return (
    <Link
      to={`/folders/${folder.id}`}
      className="group grid grid-cols-[2.2rem_1fr_7rem_5rem_5rem_5rem_2rem] items-center gap-3 px-3 py-2 border-b border-white/5 hover:bg-phosphor-400/[0.04] transition-colors"
    >
      <div
        className="w-6 h-6 border-l-2 flex items-center justify-center"
        style={{ borderLeftColor: folder.coverColor }}
      >
        <span
          className="w-1.5 h-1.5"
          style={{ background: folder.coverColor, boxShadow: `0 0 6px ${folder.coverColor}` }}
        />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] text-ink truncate group-hover:text-phosphor-100 transition-colors">
          {folder.name}
        </p>
        <p className="text-[10px] data-mono text-ink-faint truncate">
          {folder.category}
        </p>
      </div>
      <span className="text-[10px] data-mono text-ink-muted">
        {STATUS_LABEL[folder.status]}
      </span>
      <span
        className={cn(
          "text-[11px] data-mono",
          cd.overdue
            ? "text-coral"
            : cd.urgent
              ? "text-amber-400"
              : "text-phosphor-400"
        )}
      >
        {cd.text}
      </span>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[2px] bg-white/5 overflow-hidden">
          <div
            className="h-full"
            style={{ width: `${folder.progress}%`, background: folder.coverColor }}
          />
        </div>
        <span className="text-[10px] data-mono text-ink-muted w-8 text-right">
          {folder.progress}%
        </span>
      </div>
      <span className="text-[10px] data-mono text-ink-faint">
        {doneTodos}/{folder.todos.length}
      </span>
      <span
        className={cn(
          "text-[10px] data-mono",
          folder.agentConfig.enabled ? "text-phosphor-400" : "text-ink-faint"
        )}
      >
        {folder.agentConfig.enabled ? "AUTO" : "—"}
      </span>
    </Link>
  );
}

export default function Folders() {
  const folders = useMissionStore((s) => s.folders);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");

  const filtered = useMemo(() => {
    return folders.filter((f) => {
      if (status !== "all" && f.status !== status) return false;
      if (priority !== "all" && f.priority !== priority) return false;
      if (query && !f.name.toLowerCase().includes(query.toLowerCase()) && !f.category.includes(query))
        return false;
      return true;
    });
  }, [folders, status, priority, query]);

  return (
    <div className="p-5 space-y-4 max-w-[1400px] mx-auto">
      {/* 顶部 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] data-mono text-phosphor-400/70 uppercase tracking-[0.25em] mb-1">
            /// FLEET REGISTRY
          </p>
          <h1 className="font-display font-bold text-2xl text-ink tracking-tight">
            任务舱库 ·{" "}
            <span className="text-phosphor-400 text-glow-phosphor">{filtered.length}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* 视图切换 */}
          <div className="flex items-center border border-phosphor-400/15">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "px-2 py-1.5 flex items-center gap-1.5 text-[11px] transition-colors",
                view === "grid"
                  ? "bg-phosphor-400/12 text-phosphor-100"
                  : "text-ink-muted hover:text-ink"
              )}
              title="网格视图"
            >
              <LayoutGrid className="w-3 h-3" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "px-2 py-1.5 flex items-center gap-1.5 text-[11px] transition-colors border-l border-phosphor-400/15",
                view === "list"
                  ? "bg-phosphor-400/12 text-phosphor-100"
                  : "text-ink-muted hover:text-ink"
              )}
              title="列表视图"
            >
              <List className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
          <button className="btn-phosphor">
            <Plus className="w-3 h-3" strokeWidth={2} />
            新建舱体
          </button>
        </div>
      </div>

      {/* 命令栏：一句话建舱 */}
      <div className="panel p-3 flex items-center gap-3">
        <span className="text-[10px] data-mono text-phosphor-400 shrink-0">
          &gt; AI 建舱_
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="一句话描述任务，AI 自动生成舱体结构（例如：下周客户演示，准备方案与 Demo）"
          className="flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <kbd className="text-[9px] data-mono text-ink-faint border border-phosphor-400/20 px-1.5 py-0.5">
          ENTER
        </kbd>
      </div>

      {/* 筛选条 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider border transition-all",
                "font-display",
                status === t.key
                  ? "border-phosphor-400/50 bg-phosphor-400/10 text-phosphor-100"
                  : "border-white/5 text-ink-muted hover:text-ink hover:border-white/15"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3 h-3 text-ink-faint" strokeWidth={1.5} />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="bg-obsidian-850 border border-phosphor-400/15 text-[11px] text-ink px-2 py-1.5 focus:outline-none focus:border-phosphor-400/40 data-mono"
          >
            <option value="all">全部优先级</option>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-faint" strokeWidth={1.5} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索舱体"
              className="pl-7 pr-3 py-1.5 bg-obsidian-850 border border-phosphor-400/15 text-[11px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-phosphor-400/40 w-40"
            />
          </div>
        </div>
      </div>

      {/* 列表视图表头 */}
      {view === "list" && filtered.length > 0 && (
        <div className="grid grid-cols-[2.2rem_1fr_7rem_5rem_5rem_5rem_2rem] gap-3 px-3 py-1.5 text-[9px] data-mono uppercase tracking-wider text-ink-faint border-b border-phosphor-400/15">
          <span></span>
          <span>舱体</span>
          <span>状态</span>
          <span>截止</span>
          <span>进度</span>
          <span>待办</span>
          <span>AGENT</span>
        </div>
      )}

      {/* 舱体网格 / 列表 */}
      {filtered.length === 0 ? (
        <div className="panel py-16 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 border border-phosphor-400/30 flex items-center justify-center mb-3">
            <Plus className="w-5 h-5 text-phosphor-400" strokeWidth={1.5} />
          </div>
          <p className="text-[13px] text-ink mb-1">未找到匹配的舱体</p>
          <p className="text-[11px] text-ink-faint">尝试调整筛选条件或新建一个舱体</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
          {filtered.map((f, i) => (
            <div key={f.id} className="h-full" style={{ minHeight: 220 }}>
              <FolderCard folder={f} index={i} />
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          {filtered.map((f) => (
            <FolderRow key={f.id} folder={f} />
          ))}
        </div>
      )}
    </div>
  );
}
