import { useState } from "react";
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
  materials: Material[];
  onAdd?: (m: Omit<Material, "id" | "addedAt">) => void;
}

function detectType(input: string, tab: MaterialType | "auto"): MaterialType {
  if (tab !== "auto") return tab;
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return "link";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(trimmed)) return "image";
  if (/\.(pdf|docx?|xlsx?|pptx?|md|txt)$/i.test(trimmed)) return "doc";
  if (trimmed.includes("\n") || trimmed.length > 80) return "note";
  return "file";
}

export default function MaterialList({ materials, onAdd }: MaterialListProps) {
  const { text: t } = usePreferences();
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<MaterialType | "auto">("auto");
  const [input, setInput] = useState("");
  const [name, setName] = useState("");

  const reset = () => {
    setInput("");
    setName("");
    setTab("auto");
  };

  const handleSubmit = () => {
    const value = input.trim();
    if (!value) return;
    const type = detectType(value, tab);
    const finalName = name.trim() || (type === "link" ? value : value.split(/[\\/]/).pop() || value);
    onAdd?.({
      folderId: "",
      type,
      name: finalName,
      content: value,
    });
    reset();
    setModalOpen(false);
  };

  const placeholder =
    tab === "link"
      ? "https://example.com/report.pdf"
      : tab === "note"
        ? t("在此输入笔记内容…", "Write your note here…")
        : t("D:/Docs/report.pdf 或拖拽文件路径", "D:/Docs/report.pdf or drop a file path");
  const tabs: { key: MaterialType | "auto"; label: string }[] = [
    { key: "auto", label: t("自动识别", "Auto detect") },
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
        {materials.map((m) => {
          const meta = TYPE_META[m.type];
          const Icon = meta.icon;
          return (
            <div
              key={m.id}
              className="group flex items-center gap-3 px-3 py-2 border border-white/5 hover:border-phosphor-400/30 hover:bg-phosphor-400/3 transition-all cursor-pointer"
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
                <p className="text-[12px] text-ink truncate group-hover:text-phosphor-100">
                  {m.name}
                </p>
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
                </div>
              </div>
            </div>
          );
        })}
        <button
          onClick={() => setModalOpen(true)}
          className="w-full mt-2 px-3 py-2 text-[11px] text-ink-faint hover:text-phosphor-400 text-left border border-dashed border-white/5 hover:border-phosphor-400/30 transition-all flex items-center gap-2"
        >
          <Plus className="w-3 h-3" strokeWidth={1.5} />
          {t("添加材料 / 拖拽至此", "Add material / drop here")}
        </button>
      </div>

      {/* 添加材料弹窗 */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/70 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
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
                  onClick={() => setModalOpen(false)}
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
                    onClick={() => setTab(tabOption.key)}
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
                  ) : (
                    <input
                      autoFocus
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={placeholder}
                      className="w-full px-3 py-2 bg-obsidian-850/80 border border-phosphor-400/20 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-phosphor-400/60 transition-colors data-mono"
                    />
                  )}
                  <p className="text-[9px] data-mono text-ink-faint mt-1.5">
                    {tab === "auto"
                      ? t("💡 系统将根据输入内容自动识别类型（URL/路径/笔记）", "💡 The type is detected from the URL, path, or note content")
                      : tab === "file"
                        ? t("📁 Electron 接入后将支持原生文件选择器", "📁 A native file picker will be available after Electron integration")
                        : tab === "link"
                          ? t("🔗 链接将自动抓取标题（待接入）", "🔗 Link titles will be fetched automatically (coming soon)")
                          : t("📝 笔记将存储在数据库中", "📝 Notes are stored in the database")}
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] data-mono uppercase tracking-wider text-ink-faint mb-1.5">
                    {t("显示名称（可选）", "Display name (optional)")}
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("留空则使用文件名 / URL", "Leave empty to use the filename / URL")}
                    className="w-full px-3 py-2 bg-obsidian-850/80 border border-phosphor-400/20 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-phosphor-400/60 transition-colors"
                  />
                </div>
              </div>

              {/* 底部 */}
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-phosphor-400/15">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-[11px] text-ink-muted hover:text-ink border border-white/10 hover:border-white/25 transition-colors"
                >
                  {t("取消", "Cancel")}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className={cn(
                    "px-3 py-1.5 text-[11px] border transition-all flex items-center gap-1.5",
                    input.trim()
                      ? "bg-phosphor-400/12 border-phosphor-400/50 text-phosphor-100 hover:bg-phosphor-400/20"
                      : "opacity-40 cursor-not-allowed bg-phosphor-400/5 border-phosphor-400/20 text-phosphor-400/40"
                  )}
                >
                  <Check className="w-2.5 h-2.5" strokeWidth={2} />
                  {t("添加", "Add")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
