import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Link as LinkIcon,
  StickyNote,
  Image as ImageIcon,
  Paperclip,
  Plus,
  X,
  Check,
  FolderOpen,
  Loader2,
  Trash2,
  Upload,
  AlertTriangle,
  Pencil,

} from "lucide-react";
import type { Material, MaterialType } from "@/types";
import { shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";

const TYPE_META: Record<MaterialType, { icon: typeof FileText; color: string; label: string }> = {
  doc: { icon: FileText, color: "rgb(var(--phosphor-400))", label: "DOC" },
  link: { icon: LinkIcon, color: "rgb(var(--violet))", label: "LINK" },
  note: { icon: StickyNote, color: "rgb(var(--amber-500))", label: "NOTE" },
  image: { icon: ImageIcon, color: "rgb(var(--jade))", label: "IMG" },
  file: { icon: Paperclip, color: "#8B98A5", label: "FILE" },
};

interface MaterialListProps {
  folderId: string;
  materials: Material[];
  onAdd?: (m: Omit<Material, "id" | "folderId" | "addedAt">) => Promise<unknown> | void;
  onRenameNote?: (materialId: string, name: string) => Promise<unknown> | void;
  onDelete?: (materialId: string) => Promise<unknown> | void;
  disabled?: boolean;
}

type MaterialInputTab = "file" | "link" | "note";

function normalizeLocalPath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase();
}

function defaultLinkName(value: string): string {
  const url = new URL(value);
  const lastSegment = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
  return lastSegment || url.hostname;
}

function defaultNoteName(value: string): string {
  const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
}

function detectType(input: string, tab: MaterialType | "auto"): MaterialType {
  if (tab !== "auto") return tab;
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return "link";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(trimmed)) return "image";
  if (/\.(pdf|docx?|xlsx?|pptx?|md|txt|json|csv|ya?ml)$/i.test(trimmed)) return "doc";
  if (trimmed.includes("\n") || trimmed.length > 80) return "note";
  return "file";
}

export default function MaterialList({ folderId, materials, onAdd, onRenameNote, onDelete, disabled = false }: MaterialListProps) {
  const { text: t } = usePreferences();
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<MaterialInputTab>("file");
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [pickedFiles, setPickedFiles] = useState<Array<{ path: string; name: string }>>([]);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [availability, setAvailability] = useState<Record<string, "available" | "missing">>({});

  useEffect(() => {
    let disposed = false;
    const checkAvailability = () => {
      void window.missionConsole.checkMaterialAvailability(folderId)
        .then((items) => {
          if (disposed) return;
          setAvailability(Object.fromEntries(items.map((item) => [item.materialId, item.availability])));
        })
        .catch(() => {
          // 可用性检查失败不妨碍材料库原有功能；下次进入时会重新检查。
        });
    };
    checkAvailability();
    const timer = window.setInterval(checkAvailability, 30_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [folderId, materials]);

  const missingCount = useMemo(
    () => materials.filter((material) => availability[material.id] === "missing").length,
    [availability, materials],
  );

  const reset = () => {
    setInput("");
    setName("");
    setPickedFiles([]);
    setTab("file");
    setError("");
  };

  const hasDraft = Boolean(input.trim() || name.trim() || pickedFiles.length);

  const closeModal = () => {
    if (adding) return;
    if (hasDraft && !window.confirm(t("放弃未添加的材料？", "Discard materials that have not been added?"))) return;
    reset();
    setModalOpen(false);
  };

  const existingPaths = useMemo(
    () => new Set(materials
      .filter((material) => material.type !== "link" && material.type !== "note")
      .map((material) => normalizeLocalPath(material.content))),
    [materials],
  );

  const linkValidationError = useMemo(() => {
    if (tab !== "link" || !input.trim()) return "";
    try {
      const url = new URL(input.trim());
      return url.protocol === "http:" || url.protocol === "https:"
        ? ""
        : t("链接仅支持 HTTP/HTTPS", "Only HTTP/HTTPS links are supported");
    } catch {
      return t("请输入完整的 HTTP/HTTPS 链接", "Enter a complete HTTP/HTTPS URL");
    }
  }, [input, tab, t]);

  const stageFiles = async (files: Array<{ path: string; name: string }>) => {
    if (files.length === 0) return;
    setPicking(true);
    setError("");
    try {
      const currentPaths = new Set(pickedFiles.map((file) => normalizeLocalPath(file.path)));
      const next: Array<{ path: string; name: string }> = [];
      let skipped = 0;
      for (const file of files) {
        const inspected = await window.missionConsole.inspectMaterialFile(file.path);
        if (!inspected.ok) {
          setError(t(`“${file.name}”：${inspected.error}`, `“${file.name}”: ${inspected.error}`));
          continue;
        }
        const normalized = normalizeLocalPath(inspected.path);
        if (existingPaths.has(normalized) || currentPaths.has(normalized)) {
          skipped += 1;
          continue;
        }
        currentPaths.add(normalized);
        next.push({ path: inspected.path, name: inspected.name });
      }
      if (next.length) {
        setTab("file");
        setPickedFiles((current) => [...current, ...next]);
        setInput("");
      }
      if (skipped > 0) {
        setNotice(t(`已跳过 ${skipped} 个重复文件。`, `Skipped ${skipped} duplicate file(s).`));
      }
    } finally {
      setPicking(false);
    }
  };

  const handleSubmit = async () => {
    const value = input.trim();
    if (adding || (!value && pickedFiles.length === 0)) return;
    setAdding(true);
    try {
      setError("");
      if (tab === "file" && pickedFiles.length > 0) {
        const filesToAdd = pickedFiles.filter((file) => !existingPaths.has(normalizeLocalPath(file.path)));
        const skipped = pickedFiles.length - filesToAdd.length;
        let added = 0;
        try {
          for (const file of filesToAdd) {
            await onAdd?.({
              type: detectType(file.path, "auto"),
              name: filesToAdd.length === 1 ? name.trim() || file.name : file.name,
              content: file.path,
            });
            added += 1;
          }
        } catch (err) {
          const remaining = filesToAdd.slice(added);
          setPickedFiles(remaining);
          setInput(remaining.length === 1 ? remaining[0].path : "");
          setName(remaining.length === 1 ? remaining[0].name : "");
          const detail = err instanceof Error ? err.message : String(err);
          throw new Error(t(
            `已添加 ${added} 个文件，随后失败：${detail}`,
            `Added ${added} file(s), then failed: ${detail}`,
          ));
        }
        setNotice(t(
          `已添加 ${added} 个本地文件引用${skipped ? `，跳过 ${skipped} 个重复文件` : ""}；磁盘原文件未移动。`,
          `Added ${added} local file reference(s)${skipped ? ` and skipped ${skipped} duplicate(s)` : ""}; source files were not moved.`,
        ));
      } else {
        if (tab === "file") {
          const inspected = await window.missionConsole.inspectMaterialFile(value);
          if (!inspected.ok) throw new Error(inspected.error);
          if (existingPaths.has(normalizeLocalPath(inspected.path))) throw new Error(t("该文件已在当前任务舱中", "This file is already in the current folder"));
          await onAdd?.({ type: detectType(inspected.path, "auto"), name: name.trim() || inspected.name, content: inspected.path });
          setNotice(t("已添加 1 个本地文件引用；磁盘原文件未移动。", "Added 1 local file reference; the source file was not moved."));
        } else if (tab === "link") {
          let parsed: URL;
          try { parsed = new URL(value); } catch { throw new Error(t("请输入完整的 HTTP/HTTPS 链接", "Enter a complete HTTP/HTTPS URL")); }
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(t("链接仅支持 HTTP/HTTPS", "Only HTTP/HTTPS links are supported"));
          await onAdd?.({ type: "link", name: name.trim() || defaultLinkName(value), content: value });
        } else {
          const noteName = name.trim() || defaultNoteName(value);
          if (!noteName) throw new Error(t("笔记内容不能为空", "Note content cannot be empty"));
          await onAdd?.({ type: "note", name: noteName, content: value });
        }
      }
      reset();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const pickFile = async () => {
    setPicking(true);
    setError("");
    try {
      const picked = await window.missionConsole.pickMaterialFile();
      if (!Array.isArray(picked) || picked.length === 0) return;
      await stageFiles(picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPicking(false);
    }
  };

  const stageDroppedFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const localFiles = files.map((file) => ({
      path: window.missionConsole.getPathForDroppedFile(file),
      name: file.name,
    })).filter((file) => file.path);
    setModalOpen(true);
    setDragActive(false);
    await stageFiles(localFiles);
  };

  const removeMaterial = async (material: Material) => {
    if (!onDelete) return;
    const confirmed = window.confirm(
      t(
        `确定从材料库移除“${material.name}”吗？只删除应用内引用，不会删除磁盘上的源文件。`,
        `Remove “${material.name}” from Materials? This removes only the app reference, not the source file on disk.`,
      ),
    );
    if (!confirmed) return;
    setDeletingId(material.id);
    setError("");
    try {
      await onDelete(material.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  const startRenaming = (material: Material) => {
    setEditingId(material.id);
    setEditingName(material.name);
    setError("");
  };

  const renameNote = async (material: Material) => {
    const nextName = editingName.trim();
    if (!onRenameNote || !nextName || nextName === material.name) {
      if (nextName === material.name) setEditingId(null);
      return;
    }
    setRenamingId(material.id);
    setError("");
    try {
      await onRenameNote(material.id, nextName);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenamingId(null);
    }
  };

  const openMaterial = async (material: Material) => {
    setError("");
    setAvailabilityMessage("");
    try {
      const result = await window.missionConsole.openMaterial(folderId, material.id);
      if (!result.ok) {
        if (availability[material.id] === "missing" || result.error.includes("源文件已在外部移动或删除")) {
          setAvailability((current) => ({ ...current, [material.id]: "missing" }));
          setAvailabilityMessage(result.error);
        } else setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const placeholder = tab === "link"
    ? "https://example.com/report.pdf"
    : tab === "note"
      ? t("在此输入笔记内容…", "Write your note here…")
      : t("可选：粘贴完整的本地文件路径", "Optional: paste a complete local file path");
  const tabs: { key: MaterialInputTab; label: string }[] = [
    { key: "file", label: t("本地文件", "Local file") },
    { key: "link", label: t("链接", "Link") },
    { key: "note", label: t("笔记", "Note") },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 bg-phosphor-400 animate-pulse-dot" />
          <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
            {t("材料库", "Materials")}
          </h3>
        </div>
        <span className="text-[10px] data-mono text-ink-faint">
          {materials.length} ITEMS
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {missingCount > 0 && (
          <div className="flex items-start gap-2 px-2.5 py-2 border border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
            <p className="text-[10px] leading-relaxed text-amber-300">
              {t(`${missingCount} 个材料不可用：源文件已在外部移动或删除。确认后可移除应用内引用。`, `${missingCount} material reference(s) are unavailable because their source files were moved or deleted. You can remove the app references after review.`)}
            </p>
          </div>
        )}
        {materials.map((m) => {
          const meta = TYPE_META[m.type];
          const Icon = meta.icon;
          const missing = availability[m.id] === "missing";
          return (
            <div
              key={m.id}
              onClick={() => {
                if (editingId !== m.id) void openMaterial(m);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") void openMaterial(m);
              }}
              className={cn(
                "group flex items-center gap-3 px-3 py-2 border transition-all cursor-pointer",
                missing
                  ? "border-amber-500/25 bg-amber-500/[0.035] opacity-65 hover:border-amber-500/50"
                  : "border-white/5 hover:border-phosphor-400/30 hover:bg-phosphor-400/3",
              )}
            >
              <div
                className="w-7 h-7 shrink-0 flex items-center justify-center border"
                style={{
                  borderColor: `color-mix(in srgb, ${meta.color} 25%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${meta.color} 6%, transparent)`,
                }}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                {editingId === m.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") void renameNote(m);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    aria-label={t("笔记名称", "Note name")}
                    className="w-full px-2 py-1 bg-obsidian-850/80 border border-phosphor-400/50 text-[12px] text-ink focus:outline-none focus:border-phosphor-400"
                  />
                ) : (
                  <p className="text-[12px] text-ink truncate group-hover:text-phosphor-100">
                    {m.name}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-[8px] data-mono uppercase tracking-wider"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  {m.sourceIntegration && (
                    <span className="text-[9px] data-mono text-ink-faint">
                      &lt; {m.sourceIntegration}
                    </span>
                  )}
                  <span className="text-[9px] data-mono text-ink-faint">
                    {shortTime(m.addedAt)}
                  </span>
                  {missing && (
                    <span className="text-[9px] text-amber-300">
                      {t("源文件已失效", "Source missing")}
                    </span>
                  )}
                </div>
              </div>
              {m.type === "note" && (editingId === m.id ? (
                <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                  <button
                    onClick={() => void renameNote(m)}
                    disabled={!editingName.trim() || renamingId === m.id}
                    title={t("保存名称", "Save name")}
                    className="w-7 h-7 shrink-0 flex items-center justify-center border border-jade/25 text-jade hover:bg-jade/10 transition-all disabled:opacity-40"
                  >
                    {renamingId === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={renamingId === m.id}
                    title={t("取消重命名", "Cancel rename")}
                    className="w-7 h-7 shrink-0 flex items-center justify-center border border-white/10 text-ink-muted hover:text-ink transition-all disabled:opacity-40"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    startRenaming(m);
                  }}
                  disabled={disabled || !onRenameNote}
                  title={t("重命名笔记", "Rename note")}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 shrink-0 flex items-center justify-center border border-phosphor-400/25 text-phosphor-400 hover:bg-phosphor-400/10 transition-all disabled:hidden"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              ))}
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void removeMaterial(m);
                }}
                disabled={deletingId === m.id}
                title={missing ? t("移除失效引用", "Remove unavailable reference") : t("删除材料引用", "Remove material reference")}
                className={cn(
                  "shrink-0 flex items-center justify-center border border-coral/25 text-coral hover:bg-coral/10 transition-all disabled:opacity-40",
                  missing ? "px-2 h-7 text-[9px] opacity-100" : "opacity-0 group-hover:opacity-100 w-7 h-7",
                )}
              >
                {deletingId === m.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : missing ? (
                  t("移除引用", "Remove")
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "link";
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            void stageDroppedFiles(Array.from(event.dataTransfer.files));
          }}
          className={cn(
            "w-full mt-2 px-3 py-2 text-[11px] text-left border border-dashed transition-all flex items-center gap-2",
            dragActive
              ? "text-phosphor-400 border-phosphor-400/60 bg-phosphor-400/8"
              : "text-ink-faint border-white/5 hover:text-phosphor-400 hover:border-phosphor-400/30",
          )}
        >
          {dragActive ? <Upload className="w-3 h-3" /> : <Plus className="w-3 h-3" strokeWidth={1.5} />}
          {dragActive
            ? t("松开以预览本地文件", "Drop to preview local files")
            : t("添加材料 / 拖拽本地文件至此", "Add material / drop local files here")}
        </button>
        {error && <p className="px-2 py-1 text-[10px] text-coral">{error}</p>}
        {availabilityMessage && <p className="px-2 py-1 text-[10px] text-amber-300">{availabilityMessage}</p>}
        {notice && <p className="px-2 py-1 text-[10px] text-jade">{notice}</p>}
      </div>

      {/* 添加材料弹窗 */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/70 backdrop-blur-sm"
            onClick={closeModal}
          >
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md mx-4 border border-phosphor-400/30 bg-obsidian-900 shadow-2xl shadow-phosphor-400/10"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-phosphor-400/15">
                <h3 className="font-display text-[13px] uppercase tracking-[0.15em] text-ink">
                  {t("添加材料", "Add material")}
                </h3>
                <button
                  onClick={closeModal}
                  disabled={adding}
                  className="w-6 h-6 flex items-center justify-center text-ink-faint hover:text-ink border border-phosphor-400/15 hover:border-phosphor-400/40 transition-colors"
                >
                  <X className="w-3 h-3" strokeWidth={1.5} />
                </button>
              </div>

              {/* 类型切换 */}
              <div className="px-4 py-3 flex items-center gap-1 border-b border-phosphor-400/10">
                {tabs.map((tabOption) => (
                  <button
                    key={tabOption.key}
                    disabled={adding}
                    onClick={() => {
                      setTab(tabOption.key);
                      setPickedFiles([]);
                      setInput("");
                      setName("");
                      setError("");
                    }}
                    className={cn(
                      "px-2.5 py-1 text-[11px] border transition-colors",
                      tab === tabOption.key
                        ? "bg-phosphor-400/12 border-phosphor-400/50 text-phosphor-100"
                        : "border-white/5 text-ink-muted hover:text-ink hover:border-white/15"
                    )}
                  >
                    {tabOption.label}
                  </button>
                ))}
              </div>

              {/* 表单 */}
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-[10px] data-mono uppercase tracking-wider text-ink-faint mb-1.5">
                    {tab === "note" ? t("笔记内容", "Note content") : tab === "link" ? "URL" : t("文件路径", "File path")}
                  </label>
                  {tab === "note" ? (
                    <textarea
                      autoFocus
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={placeholder}
                      rows={4}
                      className="w-full px-3 py-2 bg-obsidian-850/80 border border-phosphor-400/20 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-phosphor-400/60 transition-colors resize-none"
                    />
                  ) : tab === "file" ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => void pickFile()}
                        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "link"; }}
                        onDrop={(event) => { event.preventDefault(); void stageDroppedFiles(Array.from(event.dataTransfer.files)); }}
                        disabled={picking || adding}
                        className="w-full min-h-20 border border-dashed border-phosphor-400/30 bg-phosphor-400/[0.03] text-[11px] text-ink-muted hover:text-phosphor-100 hover:border-phosphor-400/60 transition-colors flex flex-col items-center justify-center gap-2"
                      >
                        {picking ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                        {t("选择文件（支持多选）", "Choose files (multiple allowed)")}
                      </button>
                      <div className="flex items-center gap-2 text-[9px] text-ink-faint before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10">
                        {t("或粘贴路径", "or paste a path")}
                      </div>
                      <input
                        value={input}
                        disabled={adding || pickedFiles.length > 0}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder={placeholder}
                        className="w-full px-3 py-2 bg-obsidian-850/80 border border-phosphor-400/20 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-phosphor-400/60 transition-colors data-mono"
                      />
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={input}
                        disabled={adding}
                        onChange={(e) => {
                          setInput(e.target.value);
                          setPickedFiles([]);
                        }}
                        placeholder={placeholder}
                        className="flex-1 min-w-0 px-3 py-2 bg-obsidian-850/80 border border-phosphor-400/20 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-phosphor-400/60 transition-colors data-mono"
                      />
                    </div>
                  )}
                  {pickedFiles.length > 0 && (
                    <div className="mt-2 px-3 py-2 border border-phosphor-400/20 bg-phosphor-400/5">
                      <p className="text-[10px] text-phosphor-100">
                        {t(`已选择 ${pickedFiles.length} 个文件`, `${pickedFiles.length} file(s) selected`)}
                      </p>
                      <div className="mt-1 max-h-20 overflow-y-auto space-y-0.5">
                        {pickedFiles.map((file) => (
                          <div key={file.path} className="flex items-center gap-2 text-[9px] data-mono text-ink-muted" title={file.path}>
                            <span className="truncate flex-1">{file.name}</span>
                            <button type="button" onClick={() => setPickedFiles((current) => current.filter((item) => item.path !== file.path))} className="text-ink-faint hover:text-coral" title={t("移除", "Remove")}><X className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setPickedFiles([])} className="mt-2 text-[9px] text-ink-faint hover:text-coral">{t("清空全部", "Clear all")}</button>
                    </div>
                  )}
                  <p className="text-[9px] data-mono text-ink-faint mt-1.5">
                    {tab === "file"
                        ? t("📁 仅保存路径引用；移动或删除源文件后引用会失效", "📁 Only the path is saved; moving or deleting the source file breaks the reference")
                        : tab === "link"
                          ? t("🔗 仅支持完整的 HTTP/HTTPS 链接", "🔗 Complete HTTP/HTTPS URLs only")
                          : t("📝 笔记将存储在数据库中", "📝 Notes are stored in the database")}
                  </p>
                  {linkValidationError && <p className="text-[9px] text-coral mt-1.5">{linkValidationError}</p>}
                  {pickedFiles.length > 1 && (
                    <p className="text-[9px] data-mono text-phosphor-300 mt-1.5">
                      {t(`已选择 ${pickedFiles.length} 个文件，添加时将分别创建引用`, `${pickedFiles.length} files selected; each will be added as a reference.`)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] data-mono uppercase tracking-wider text-ink-faint mb-1.5">
                    {t("显示名称（可选）", "Display name (optional)")}
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={adding || pickedFiles.length > 1}
                    placeholder={pickedFiles.length > 1
                      ? t("多文件将分别使用各自文件名", "Each file will use its own filename")
                      : t("留空则使用文件名 / URL", "Leave empty to use the filename / URL")}
                    className="w-full px-3 py-2 bg-obsidian-850/80 border border-phosphor-400/20 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-phosphor-400/60 transition-colors"
                  />
                </div>
                {error && (
                  <div className="px-3 py-2 border border-coral/30 bg-coral/5 text-[10px] text-coral">
                    {error}
                  </div>
                )}
              </div>

              {/* 底部 */}
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-phosphor-400/15">
                <button
                  onClick={closeModal}
                  disabled={adding}
                  className="px-3 py-1.5 text-[11px] text-ink-muted hover:text-ink border border-white/10 hover:border-white/25 transition-colors"
                >
                  {t("取消", "Cancel")}
                </button>
                <button
                  onClick={() => void handleSubmit()}
                  disabled={(!input.trim() && pickedFiles.length === 0) || Boolean(linkValidationError) || adding}
                  className={cn(
                    "px-3 py-1.5 text-[11px] border transition-all flex items-center gap-1.5",
                    (input.trim() || pickedFiles.length > 0) && !linkValidationError && !adding
                      ? "bg-phosphor-400/12 border-phosphor-400/50 text-phosphor-100 hover:bg-phosphor-400/20"
                      : "opacity-40 cursor-not-allowed bg-phosphor-400/5 border-phosphor-400/20 text-phosphor-400/40"
                  )}
                >
                  {adding ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" strokeWidth={2} />}
                  {adding ? t("添加中…", "Adding…") : t("添加", "Add")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
