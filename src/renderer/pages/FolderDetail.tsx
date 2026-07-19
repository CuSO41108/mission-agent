import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Tag,
  Archive,
  Pause,
  Play,
  CheckCircle2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import PriorityBadge from "@/components/ui/PriorityBadge";
import StatusDot from "@/components/ui/StatusDot";
import TodoList from "@/components/folder-detail/TodoList";
import MaterialList from "@/components/folder-detail/MaterialList";
import TimelineView from "@/components/folder-detail/TimelineView";
import AgentControlPanel from "@/components/folder-detail/AgentControlPanel";
import { countdown, relativeTime, shortTime, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";
import { accentTint, themeAccent } from "@/lib/theme";

export default function FolderDetail() {
  const { locale, text: t } = usePreferences();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const folder = useMissionStore((s) => s.folders.find((f) => f.id === id));
  const setFolderStatus = useMissionStore((s) => s.setFolderStatus);
  const addMaterial = useMissionStore((s) => s.addMaterial);
  const deleteMaterial = useMissionStore((s) => s.deleteMaterial);
  const deleteFolder = useMissionStore((s) => s.deleteFolder);

  const permanentlyDeleteFolder = async () => {
    if (!folder) return;
    const confirmed = window.confirm(
      t(
        `确定永久删除任务舱“${folder.name}”吗？待办、材料引用和时间线记录都会从本地数据库删除，但磁盘源文件不会被删除。此操作不可撤销。`,
        `Permanently delete “${folder.name}”? Todos, material references, and timeline entries will be removed from the local database, but source files on disk will remain. This cannot be undone.`,
      ),
    );
    if (!confirmed) return;
    try {
      const deleted = await deleteFolder(folder.id);
      if (!deleted) throw new Error(t("任务舱删除失败", "Failed to delete folder"));
      navigate("/folders");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  if (!folder) {
    return (
      <div className="p-10 text-center">
        <p className="text-ink-muted mb-3">{t("任务舱未找到", "Mission folder not found")}</p>
        <Link to="/folders" className="btn-phosphor inline-flex">
          {t("返回舱库", "Back to folders")}
        </Link>
      </div>
    );
  }

  const cd = countdown(folder.deadline, locale);
  const coverColor = themeAccent(folder.coverColor);

  return (
    <div className="h-full flex flex-col">
      {/* 顶部信息条 */}
      <div className="shrink-0 border-b border-phosphor-400/12 bg-obsidian-900/40 backdrop-blur-sm">
        <div className="p-5 max-w-[1500px] mx-auto">
          {/* 面包屑 + 返回 */}
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate("/folders")}
              className="flex items-center gap-1.5 text-[11px] data-mono text-ink-faint hover:text-phosphor-400 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" strokeWidth={1.5} />
              FOLDERS
            </button>
            <span className="text-ink-faint">/</span>
            <span className="text-[11px] data-mono text-phosphor-400">
              {folder.id.toUpperCase()}
            </span>
          </div>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              {/* 色块图标 */}
              <div
                className="relative w-14 h-14 shrink-0 flex items-center justify-center border-2 clip-corner"
                style={{
                  borderColor: coverColor,
                  background: accentTint(folder.coverColor, 0.06),
                  boxShadow: `0 0 24px -8px ${coverColor}`,
                }}
              >
                <span
                  className="font-display font-bold text-xl data-mono"
                  style={{ color: coverColor, textShadow: `0 0 12px color-mix(in srgb, ${coverColor} 40%, transparent)` }}
                >
                  {folder.progress}
                </span>
                <span
                  className="absolute -top-1 -right-1 w-2 h-2 rotate-45"
                  style={{ background: coverColor, boxShadow: `0 0 8px ${coverColor}` }}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <PriorityBadge priority={folder.priority} />
                  <span className="chip border-ink-faint/30 text-ink-faint">
                    <StatusDot status={folder.status} />
                    {statusLabel(folder.status, locale)}
                  </span>
                  <span className="chip border-phosphor-400/30 text-phosphor-400 bg-phosphor-400/5">
                    <Tag className="w-2.5 h-2.5" strokeWidth={1.5} />
                    {folder.category}
                  </span>
                  {folder.sourceIntegration && (
                    <span className="chip border-violet/30 text-violet bg-violet/5">
                      &lt; {folder.sourceIntegration}
                    </span>
                  )}
                </div>
                <h1 className="font-display font-bold text-xl text-ink leading-tight tracking-tight">
                  {folder.name}
                </h1>
                <div className="flex items-center gap-4 mt-1.5 text-[10px] data-mono text-ink-faint">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5" strokeWidth={1.5} />
                    {t("创建于", "Created")} {shortTime(folder.createdAt)}
                  </span>
                  {folder.deadline && (
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        cd.overdue ? "text-coral" : cd.urgent ? "text-amber-400" : "text-phosphor-400"
                      )}
                    >
                      {t("截止", "Due")} {relativeTime(folder.deadline, locale)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 操作组 */}
            <div className="flex items-center gap-2 shrink-0">
              {folder.status === "archived" ? (
                <>
                  <button onClick={() => setFolderStatus(folder.id, "active")} className="btn-ghost">
                    <RotateCcw className="w-3 h-3" /> {t("恢复", "Restore")}
                  </button>
                  <button onClick={() => void permanentlyDeleteFolder()} className="btn-coral">
                    <Trash2 className="w-3 h-3" /> {t("永久删除", "Delete permanently")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setFolderStatus(folder.id, folder.status === "paused" ? "active" : "paused")}
                    className="btn-ghost"
                  >
                    {folder.status === "paused" ? (
                  <>
                    <Play className="w-3 h-3" strokeWidth={1.5} /> {t("继续", "Resume")}
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3" strokeWidth={1.5} /> {t("暂停", "Pause")}
                  </>
                    )}
                  </button>
                  <button
                    onClick={() => setFolderStatus(folder.id, "done")}
                    className="btn-ghost"
                  >
                    <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} /> {t("完成", "Complete")}
                  </button>
                  <button
                    onClick={() => setFolderStatus(folder.id, "archived")}
                    className="btn-coral"
                  >
                    <Archive className="w-3 h-3" strokeWidth={1.5} /> {t("归档", "Archive")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 三栏内容区 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 p-5 h-full max-w-[1500px] mx-auto">
          {/* 左：待办 */}
          <div className="col-span-12 lg:col-span-4 panel h-full overflow-hidden flex flex-col">
            <TodoList folderId={folder.id} todos={folder.todos} />
          </div>

          {/* 中：材料 + 笔记 */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 h-full min-h-0">
            <div className="panel flex-1 min-h-0 overflow-hidden flex flex-col">
              <MaterialList
                folderId={folder.id}
                materials={folder.materials}
                onAdd={(m) => addMaterial(folder.id, m)}
                onDelete={(materialId) => deleteMaterial(folder.id, materialId)}
              />
            </div>
            <div className="panel shrink-0 h-[200px] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-amber-400 animate-pulse-dot" />
                  <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
                    {t("笔记", "Notes")}
                  </h3>
                </div>
                <span className="text-[9px] data-mono text-ink-faint">DRAFT</span>
              </div>
              <div className="flex-1 p-3 overflow-y-auto">
                <textarea
                  placeholder={t("在此记录想法、引用材料或链接待办…", "Capture thoughts, reference material, or linked todos…")}
                  className="w-full h-full bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus:outline-none resize-none leading-relaxed"
                  defaultValue={
                    folder.id === "f-001"
                      ? "13 笔跨境差异集中于 8 月汇率波动窗口，已请求财务复核。\n\n关键引用：\n- Q3-营收明细表.xlsx\n- 待办「核对跨境结算差异」"
                      : t("在此记录关键想法与决策…", "Record key ideas and decisions here…")
                  }
                />
              </div>
            </div>
          </div>

          {/* 右：Agent 面板 + 时间线 */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 h-full min-h-0">
            <div className="panel shrink-0 max-h-[360px] overflow-hidden flex flex-col">
              <AgentControlPanel folderId={folder.id} config={folder.agentConfig} />
            </div>
            <div className="panel flex-1 min-h-0 overflow-hidden flex flex-col">
              <TimelineView entries={folder.timeline} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
