import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Save, StickyNote } from "lucide-react";
import type { Material } from "@/types";
import { useMissionStore } from "@/store/useMissionStore";
import { usePreferences } from "@/i18n";
import { cn } from "@/lib/utils";

const FOLDER_NOTE_NAME = "任务舱笔记";

interface FolderNotesProps {
  folderId: string;
  materials: Material[];
  disabled?: boolean;
}

export default function FolderNotes({ folderId, materials, disabled = false }: FolderNotesProps) {
  const { text: t } = usePreferences();
  const addMaterial = useMissionStore((state) => state.addMaterial);
  const updateNoteMaterial = useMissionStore((state) => state.updateNoteMaterial);
  const note = useMemo(
    () => materials.find((material) => material.type === "note" && material.name === FOLDER_NOTE_NAME) ?? null,
    [materials],
  );
  const [value, setValue] = useState(note?.content ?? "");
  const [savedValue, setSavedValue] = useState(note?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const content = note?.content ?? "";
    setValue(content);
    setSavedValue(content);
    setMessage("");
  }, [folderId, note?.id, note?.content]);

  const dirty = value !== savedValue;

  const save = async () => {
    if (saving || disabled || (!note && !value.trim()) || !dirty) return;
    setSaving(true);
    setMessage("");
    try {
      if (note) {
        await updateNoteMaterial(folderId, note.id, value);
      } else {
        await addMaterial(folderId, { type: "note", name: FOLDER_NOTE_NAME, content: value });
      }
      setSavedValue(value);
      setMessage(t("已保存到材料库，Agent 可以读取。", "Saved to Materials and available to the Agent."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel shrink-0 h-[220px] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <StickyNote className="w-3 h-3 text-amber-400 shrink-0" />
          <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
            {t("任务舱笔记", "Folder note")}
          </h3>
          <span className={cn("text-[9px] data-mono", dirty ? "text-amber-500" : "text-jade")}>
            {dirty ? t("未保存", "Unsaved") : t("已保存", "Saved")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || disabled || !dirty || (!note && !value.trim())}
          className="btn-ghost h-7 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : dirty ? <Save className="w-3 h-3" /> : <Check className="w-3 h-3" />}
          {saving ? t("保存中", "Saving") : t("保存", "Save")}
        </button>
      </div>
      <div className="flex-1 p-3 min-h-0">
        <textarea
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setMessage("");
          }}
          disabled={disabled}
          placeholder={t("在此记录关键信息；点击保存后会作为笔记材料供 Agent 读取。", "Record key information here. Save it to make it available to the Agent.")}
          className="w-full h-full bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus:outline-none resize-none leading-relaxed disabled:opacity-60"
        />
      </div>
      {message && <p className="px-3 pb-2 text-[9px] leading-relaxed text-ink-faint">{message}</p>}
    </div>
  );
}
