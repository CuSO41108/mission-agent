import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, LayoutGrid, List, Filter } from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import FolderCard from "@/components/folders/FolderCard";
import { priorityLabel, countdown, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskFolder } from "@/types";
import { usePreferences } from "@/i18n";
import { themeAccent } from "@/lib/theme";
import CreateFolderModal from "@/components/folders/CreateFolderModal";

type StatusFilter = "all" | "active" | "paused" | "done" | "archived";
type ViewMode = "grid" | "list";

function FolderRow({ folder }: { folder: TaskFolder }) {
  const { locale } = usePreferences();
  const cd = countdown(folder.deadline, locale);
  const doneTodos = folder.todos.filter((t) => t.done).length;
  const coverColor = themeAccent(folder.coverColor);
  return (
    <Link
      to={`/folders/${folder.id}`}
      className="group grid grid-cols-[2.2rem_1fr_7rem_5rem_5rem_5rem_2rem] items-center gap-3 px-3 py-2 border-b border-white/5 hover:bg-phosphor-400/[0.04] transition-colors"
    >
      <div
        className="w-6 h-6 border-l-2 flex items-center justify-center"
        style={{ borderLeftColor: coverColor }}
      >
        <span
          className="w-1.5 h-1.5"
          style={{ background: coverColor, boxShadow: `0 0 6px ${coverColor}` }}
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
        {statusLabel(folder.status, locale)}
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
            style={{ width: `${folder.progress}%`, background: coverColor }}
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
  const { locale, text: t } = usePreferences();
  const folders = useMissionStore((s) => s.folders);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: t("全部", "All") },
    { key: "active", label: t("进行中", "Active") },
    { key: "paused", label: t("暂停", "Paused") },
    { key: "done", label: t("已完成", "Completed") },
    { key: "archived", label: t("已归档", "Archived") },
  ];

  useEffect(() => {
    if (searchParams.get("create") === "1") setCreateOpen(true);
  }, [searchParams]);

  const closeCreate = () => {
    setCreateOpen(false);
    if (searchParams.has("create")) setSearchParams({}, { replace: true });
  };

  const filtered = useMemo(() => {
    return folders.filter((f) => {
      if (status === "all" && f.status === "archived") return false;
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
          <p className="text-[11px] text-ink-faint mb-1">
            {t("集中查看和管理所有任务", "Review and manage all work")}
          </p>
          <h1 className="font-display font-semibold text-2xl text-ink">
            {t("任务舱", "Mission folders")} <span className="text-ink-faint">{filtered.length}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* 视图切换 */}
          <div className="flex items-center border border-obsidian-700 rounded bg-obsidian-800 overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "px-2 py-1.5 flex items-center gap-1.5 text-[11px] transition-colors",
                view === "grid"
                  ? "bg-obsidian-850 text-ink"
                  : "text-ink-muted hover:text-ink"
              )}
              title={t("网格视图", "Grid view")}
            >
              <LayoutGrid className="w-3 h-3" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "px-2 py-1.5 flex items-center gap-1.5 text-[11px] transition-colors border-l border-obsidian-700",
                view === "list"
                  ? "bg-obsidian-850 text-ink"
                  : "text-ink-muted hover:text-ink"
              )}
              title={t("列表视图", "List view")}
            >
              <List className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
          <button onClick={() => setCreateOpen(true)} className="btn-phosphor">
            <Plus className="w-3 h-3" strokeWidth={2} />
            {t("新建舱体", "New folder")}
          </button>
        </div>
      </div>

      {/* 筛选条 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatus(tab.key)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-medium border rounded transition-all",
                status === tab.key
                  ? "border-phosphor-400/25 bg-phosphor-400/10 text-phosphor-600"
                  : "border-transparent text-ink-muted hover:text-ink hover:bg-obsidian-850"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3 h-3 text-ink-faint" strokeWidth={1.5} />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="bg-obsidian-800 border border-obsidian-700 rounded text-[11px] text-ink px-2 py-1.5 focus:outline-none focus:border-phosphor-400 data-mono"
          >
            <option value="all">{t("全部优先级", "All priorities")}</option>
            {["critical", "high", "medium", "low"].map((k) => (
              <option key={k} value={k}>
                {priorityLabel(k, locale)}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-faint" strokeWidth={1.5} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("搜索舱体", "Search folders")}
              className="pl-7 pr-3 py-1.5 bg-obsidian-800 border border-obsidian-700 rounded text-[11px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-phosphor-400 w-40"
            />
          </div>
        </div>
      </div>

      {/* 列表视图表头 */}
      {view === "list" && filtered.length > 0 && (
        <div className="grid grid-cols-[2.2rem_1fr_7rem_5rem_5rem_5rem_2rem] gap-3 px-3 py-1.5 text-[9px] data-mono uppercase tracking-wider text-ink-faint border-b border-phosphor-400/15">
          <span></span>
          <span>{t("舱体", "Folder")}</span>
          <span>{t("状态", "Status")}</span>
          <span>{t("截止", "Deadline")}</span>
          <span>{t("进度", "Progress")}</span>
          <span>{t("待办", "Todos")}</span>
          <span>AGENT</span>
        </div>
      )}

      {/* 舱体网格 / 列表 */}
      {filtered.length === 0 ? (
        <div className="panel py-16 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded border border-obsidian-700 bg-obsidian-850 flex items-center justify-center mb-3">
            <Plus className="w-5 h-5 text-phosphor-400" strokeWidth={1.5} />
          </div>
          <p className="text-[13px] text-ink mb-1">{t("未找到匹配的舱体", "No matching folders")}</p>
          <p className="text-[11px] text-ink-faint">{t("尝试调整筛选条件或新建一个舱体", "Try adjusting the filters or create a new folder")}</p>
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
      <CreateFolderModal
        open={createOpen}
        onClose={closeCreate}
        onCreated={(folder) => navigate(`/folders/${folder.id}`)}
      />
    </div>
  );
}
