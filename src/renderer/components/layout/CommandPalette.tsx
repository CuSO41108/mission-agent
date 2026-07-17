import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Folder,
  ListChecks,
  FileText,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";

type ItemKind = "folder" | "todo" | "material";

interface SearchItem {
  id: string;
  kind: ItemKind;
  label: string;
  sub: string;
  href: string;
  folderId: string;
}

const KIND_ICON = {
  folder: Folder,
  todo: ListChecks,
  material: FileText,
};

function highlight(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const ql = query.toLowerCase();
  const idx = lower.indexOf(ql);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-phosphor-400/30 text-phosphor-100 px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function CommandPalette() {
  const { text: t } = usePreferences();
  const open = useMissionStore((s) => s.commandPaletteOpen);
  const setOpen = useMissionStore((s) => s.setCommandPaletteOpen);
  const folders = useMissionStore((s) => s.folders);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const kindLabel: Record<ItemKind, string> = {
    folder: t("舱体", "Folder"),
    todo: t("待办", "Todo"),
    material: t("材料", "Material"),
  };

  // 全局快捷键 ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  // 关闭时重置
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  // 构建索引
  const allItems = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];
    for (const f of folders) {
      items.push({
        id: `f-${f.id}`,
        kind: "folder",
        label: f.name,
        sub: f.category,
        href: `/folders/${f.id}`,
        folderId: f.id,
      });
      for (const t of f.todos) {
        items.push({
          id: `t-${t.id}`,
          kind: "todo",
          label: t.title,
          sub: f.name,
          href: `/folders/${f.id}`,
          folderId: f.id,
        });
      }
      for (const m of f.materials) {
        items.push({
          id: `m-${m.id}`,
          kind: "material",
          label: m.name,
          sub: f.name,
          href: `/folders/${f.id}`,
          folderId: f.id,
        });
      }
    }
    return items;
  }, [folders]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 8);
    const ql = query.toLowerCase();
    return allItems
      .filter(
        (i) =>
          i.label.toLowerCase().includes(ql) || i.sub.toLowerCase().includes(ql)
      )
      .slice(0, 20);
  }, [query, allItems]);

  // 键盘上下选择
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[activeIdx];
        if (item) {
          navigate(item.href);
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, activeIdx, navigate, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-obsidian-950/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl mx-4 border border-phosphor-400/30 bg-obsidian-900 shadow-2xl shadow-phosphor-400/10"
          >
            {/* 输入框 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-phosphor-400/15">
              <Search className="w-4 h-4 text-phosphor-400" strokeWidth={1.5} />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                placeholder={t("搜索舱体 / 待办 / 材料…", "Search folders / todos / materials…")}
                className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center text-ink-faint hover:text-ink border border-phosphor-400/15 hover:border-phosphor-400/40 transition-colors"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </div>

            {/* 结果列表 */}
            <div className="max-h-[50vh] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-ink-faint">
                  {t("未匹配到结果", "No matching results")}
                </div>
              ) : (
                filtered.map((item, idx) => {
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => {
                        navigate(item.href);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                        idx === activeIdx
                          ? "bg-phosphor-400/8 border-l-2 border-phosphor-400"
                          : "border-l-2 border-transparent hover:bg-white/[0.02]"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          idx === activeIdx ? "text-phosphor-400" : "text-ink-faint"
                        )}
                        strokeWidth={1.5}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-ink truncate">
                          {highlight(item.label, query)}
                        </div>
                        <div className="text-[10px] data-mono text-ink-faint truncate">
                          {item.sub}
                        </div>
                      </div>
                      <span className="text-[9px] data-mono text-phosphor-400/50 uppercase tracking-wider shrink-0">
                        {kindLabel[item.kind]}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* 底部提示 */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-phosphor-400/15 text-[10px] data-mono text-ink-faint">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <ArrowUp className="w-2.5 h-2.5" />
                  <ArrowDown className="w-2.5 h-2.5" />
                  {t("选择", "Select")}
                </span>
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="w-2.5 h-2.5" />
                  {t("跳转", "Open")}
                </span>
                <span className="flex items-center gap-1">
                  ESC
                  {t("关闭", "Close")}
                </span>
              </div>
              <span className="text-phosphor-400/60">
                {filtered.length} / {allItems.length} {t("项", "items")}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
