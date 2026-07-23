import {
  CheckCircle2,
  Circle,
  Clock,
  User,
  Bot,
  ChevronRight,
  Check,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useState } from "react";
import type { AgentTaskType, ArtifactFormat, Assignee, Todo } from "@/types";
import { useMissionStore } from "@/store/useMissionStore";
import { shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";
import { countTodos } from "@/lib/missionStats";

interface TodoListProps {
  folderId: string;
  todos: Todo[];
}

export default function TodoList({ folderId, todos }: TodoListProps) {
  const { text: translate } = usePreferences();
  const toggle = useMissionStore((s) => s.toggleTodo);
  const createTodo = useMissionStore((s) => s.createTodo);
  const workflows = useMissionStore((s) => s.workflows);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([todos[0]?.id]));
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<Assignee>("human");
  const [agentTaskType, setAgentTaskType] = useState<AgentTaskType>("analysis");
  const [artifactFormat, setArtifactFormat] = useState<ArtifactFormat>("markdown");
  const [workflowId, setWorkflowId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submitTodo = async () => {
    if (!title.trim() || saving) return;
    if (assignee === "agent" && agentTaskType === "workflow" && !workflowId) {
      setError(translate("请先选择工作流", "Select a workflow first"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createTodo(folderId, {
        title,
        dueDate: dueDate ? new Date(dueDate).getTime() : null,
        assignee,
        agentTaskType: assignee === "agent" ? agentTaskType : undefined,
        artifactFormat: assignee === "agent" ? artifactFormat : undefined,
        workflowId: assignee === "agent" && agentTaskType === "workflow" ? workflowId || null : null,
      });
      setTitle("");
      setDueDate("");
      setAssignee("human");
      setAgentTaskType("analysis");
      setArtifactFormat("markdown");
      setWorkflowId("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTodo = (t: Todo, depth = 0) => {
    const hasSubs = t.subtasks.length > 0;
    const isExpanded = expanded.has(t.id);
    return (
      <div key={t.id}>
        <div
          className={cn(
            "group flex items-start gap-2.5 px-2.5 py-2 border-l-2 transition-all",
            t.done
              ? "border-jade/40 bg-jade/5"
              : "border-transparent hover:border-phosphor-400/40 hover:bg-phosphor-400/3"
          )}
          style={{ marginLeft: depth * 16 }}
        >
          <button
            onClick={() => void toggle(folderId, t.id).catch((err) => setError(err instanceof Error ? err.message : String(err)))}
            className="mt-0.5 shrink-0"
          >
            {t.done ? (
              <CheckCircle2 className="w-4 h-4 text-jade" strokeWidth={1.5} />
            ) : (
              <Circle className="w-4 h-4 text-ink-faint group-hover:text-phosphor-400" strokeWidth={1.5} />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "text-[12px] leading-snug",
                  t.done ? "text-ink-faint line-through" : "text-ink"
                )}
              >
                {t.title}
              </span>
              <span
                className={cn(
                  "chip border text-[9px]",
                  t.assignee === "agent"
                    ? "border-phosphor-400/40 text-phosphor-400 bg-phosphor-400/5"
                    : "border-amber-500/40 text-amber-400 bg-amber-500/5"
                )}
              >
                {t.assignee === "agent" ? (
                  <Bot className="w-2.5 h-2.5" strokeWidth={1.5} />
                ) : (
                  <User className="w-2.5 h-2.5" strokeWidth={1.5} />
                )}
                {t.assignee === "agent" ? "AGENT" : "HUMAN"}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[9px] data-mono text-ink-faint">
              {t.dueDate && (
                <span className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" strokeWidth={1.5} />
                  {shortTime(t.dueDate)}
                </span>
              )}
              {t.source && <span className="truncate">&gt; {t.source}</span>}
              {hasSubs && (
                <button
                  onClick={() => toggleExpand(t.id)}
                  className="flex items-center gap-1 hover:text-phosphor-400 transition-colors"
                >
                  <ChevronRight
                    className={cn("w-2.5 h-2.5 transition-transform", isExpanded && "rotate-90")}
                    strokeWidth={1.5}
                  />
                  {t.subtasks.length} {t.subtasks.length === 1 ? translate("子任务", "subtask") : translate("子任务", "subtasks")}
                </button>
              )}
            </div>
          </div>
        </div>
        {hasSubs && isExpanded && (
          <div className="mt-0.5">
            {t.subtasks.map((st) => renderTodo(st, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const todoCounts = countTodos(todos);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 bg-phosphor-400 animate-pulse-dot" />
          <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
            {translate("待办清单", "Todo list")}
          </h3>
        </div>
        <span className="text-[10px] data-mono text-ink-faint">
          {todoCounts.done}/{todoCounts.total} · {todoCounts.total - todoCounts.done} OPEN
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {todos.map((t) => renderTodo(t))}
        {adding ? (
          <div className="m-2 p-3 border border-phosphor-400/25 bg-phosphor-400/[0.03] space-y-2">
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void submitTodo()}
              placeholder={translate("待办标题", "Todo title")}
              className="input w-full"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={assignee}
                onChange={(event) => setAssignee(event.target.value as Assignee)}
                className="input w-full"
              >
                <option value="human">{translate("由我处理", "Human")}</option>
                <option value="agent">{translate("交给 Agent", "Agent")}</option>
              </select>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="input w-full"
                title={translate("截止时间（可选）", "Deadline (optional)")}
              />
            </div>
            {assignee === "agent" && (
              <div className="grid grid-cols-2 gap-2">
                <select value={agentTaskType} onChange={(event) => setAgentTaskType(event.target.value as AgentTaskType)} className="input w-full">
                  <option value="analysis">{translate("分析建议（不自动完成）", "Analysis (does not auto-complete)")}</option>
                  <option value="artifact">{translate("生成本地产物", "Create local artifact")}</option>
                  <option value="follow_up">{translate("应用内跟进提醒", "In-app follow-up")}</option>
                  <option value="material_organize">{translate("整理本地材料", "Organize local materials")}</option>
                  <option value="progress_summary">{translate("生成进度摘要", "Create progress summary")}</option>
                  <option value="workflow">{translate("执行工作流", "Run workflow")}</option>
                </select>
                {(["artifact", "material_organize", "progress_summary"] as AgentTaskType[]).includes(agentTaskType) && (
                  <select value={artifactFormat} onChange={(event) => setArtifactFormat(event.target.value as ArtifactFormat)} className="input w-full">
                    <option value="markdown">Markdown（{translate("推荐", "recommended")}）</option>
                    <option value="text">{translate("纯文本", "Plain text")}</option>
                    <option value="json">JSON</option>
                  </select>
                )}
                {agentTaskType === "workflow" && (
                  <select value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} className="input w-full">
                    <option value="">{translate("选择工作流", "Select workflow")}</option>
                    {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                  </select>
                )}
              </div>
            )}
            {assignee === "agent" && (
              <p className="text-[9px] text-ink-faint">
                {translate("Markdown 只是默认推荐格式；只有“生成产物/整理材料/进度摘要”会写文件。", "Markdown is only the recommended default; only artifact tasks write files.")}
              </p>
            )}
            {error && <p className="text-[10px] text-coral">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setAdding(false);
                  setError("");
                }}
                className="btn-ghost"
              >
                <X className="w-3 h-3" /> {translate("取消", "Cancel")}
              </button>
              <button
                onClick={() => void submitTodo()}
                disabled={!title.trim() || saving}
                className="btn-phosphor disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {translate("添加", "Add")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setAdding(true);
              setError("");
            }}
            className="w-full mt-2 px-4 py-2 text-[11px] text-ink-faint hover:text-phosphor-400 text-left border border-dashed border-white/5 hover:border-phosphor-400/30 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> {translate("添加待办…", "Add todo…")}
          </button>
        )}
        {!adding && error && <p className="px-4 py-1 text-[10px] text-coral">{error}</p>}
      </div>
    </div>
  );
}
