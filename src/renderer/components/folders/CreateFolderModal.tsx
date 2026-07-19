import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Calendar, Check, X } from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { usePreferences } from "@/i18n";
import type { Priority, TaskFolder } from "@/types";
import { cn } from "@/lib/utils";

interface CreateFolderModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (folder: TaskFolder) => void;
}

export default function CreateFolderModal({ open, onClose, onCreated }: CreateFolderModalProps) {
  const { text: t } = usePreferences();
  const createFolder = useMissionStore((state) => state.createFolder);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [deadline, setDeadline] = useState("");
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setCategory("");
    setPriority("medium");
    setDeadline("");
    setAgentEnabled(false);
    setError("");
  }, [open]);

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const folder = await createFolder({
        name,
        category,
        priority,
        deadline: deadline ? new Date(deadline).getTime() : null,
        agentEnabled,
      });
      onCreated(folder);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/75 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg mx-4 border border-phosphor-400/30 bg-obsidian-900 shadow-2xl shadow-phosphor-400/10"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-phosphor-400/15">
              <div>
                <h2 className="font-display text-[14px] uppercase tracking-[0.16em] text-ink">
                  {t("新建任务舱", "Create mission folder")}
                </h2>
                <p className="text-[10px] text-ink-faint mt-1">
                  {t("先创建空舱，再按需要添加待办、材料和 Agent。", "Start empty, then add todos, materials, and Agent automation as needed.")}
                </p>
              </div>
              <button onClick={onClose} className="btn-icon" title={t("关闭", "Close")}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <label className="block">
                <span className="block text-[11px] text-ink-muted mb-1.5">{t("名称", "Name")} *</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void submit()}
                  placeholder={t("例如：客户演示准备", "e.g. Client demo preparation")}
                  className="input w-full"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="block text-[11px] text-ink-muted mb-1.5">{t("分类", "Category")}</span>
                  <input
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    placeholder={t("工作 / 学习 / 个人", "Work / Study / Personal")}
                    className="input w-full"
                  />
                </label>
                <label>
                  <span className="block text-[11px] text-ink-muted mb-1.5">{t("优先级", "Priority")}</span>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as Priority)}
                    className="input w-full"
                  >
                    <option value="critical">{t("紧急", "Critical")}</option>
                    <option value="high">{t("高", "High")}</option>
                    <option value="medium">{t("中", "Medium")}</option>
                    <option value="low">{t("低", "Low")}</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="flex items-center gap-1.5 text-[11px] text-ink-muted mb-1.5">
                  <Calendar className="w-3 h-3" /> {t("截止时间（可选）", "Deadline (optional)")}
                </span>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="input w-full"
                />
              </label>

              <button
                type="button"
                onClick={() => setAgentEnabled((value) => !value)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 border text-left transition-colors",
                  agentEnabled
                    ? "border-phosphor-400/40 bg-phosphor-400/8"
                    : "border-white/8 bg-white/[0.02]",
                )}
              >
                <Bot className={cn("w-4 h-4", agentEnabled ? "text-phosphor-400" : "text-ink-faint")} />
                <div className="flex-1">
                  <p className="text-[12px] text-ink">{t("创建后启用 Agent", "Enable Agent after creation")}</p>
                  <p className="text-[10px] text-ink-faint mt-0.5">
                    {t("默认关闭；开启后心跳可能调用 DeepSeek。", "Off by default; enabling it may call DeepSeek during heartbeats.")}
                  </p>
                </div>
                <span className={cn("w-2 h-2 rounded-full", agentEnabled ? "bg-jade" : "bg-ink-faint")} />
              </button>

              {error && (
                <div className="px-3 py-2 border border-coral/30 bg-coral/5 text-[11px] text-coral">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-phosphor-400/15">
              <button onClick={onClose} className="btn-ghost">{t("取消", "Cancel")}</button>
              <button
                onClick={() => void submit()}
                disabled={!name.trim() || submitting}
                className="btn-phosphor disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-3 h-3" />
                {submitting ? t("创建中…", "Creating…") : t("创建任务舱", "Create folder")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
