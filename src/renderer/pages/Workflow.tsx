import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Workflow as WorkflowIcon,
  Plus,
  Zap,
  GitBranch,
  Filter,
  Play,
  Pencil,
  Trash2,
  Save,
  X,
  Loader2,
  History,
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";
import type {
  UpsertWorkflowInput,
  WorkflowAction,
  WorkflowCondition,
  WorkflowNodeLayout,
  WorkflowRule,
  WorkflowRun,
  WorkflowStepRun,
  IntegrationAdapter,
} from "@/types";
import type { ModelProfile } from "@core/config";

const triggerLabels = {
  manual: "手动执行",
  schedule: "定时执行",
  todo_created: "待办创建",
  todo_completed: "待办完成",
  material_added: "材料添加",
  folder_status_changed: "任务舱状态变化",
} as const;

const actionLabels = {
  create_todo: "创建待办",
  set_folder_status: "修改任务舱状态",
  agent: "运行可配置 Agent",
  run_agent: "运行 Agent",
  write_timeline: "写入时间线",
  notify: "发送应用内通知",
  send_feishu_message: "发送飞书消息",
  save_artifact: "保存产物",
} as const;

function actionConfig(type: WorkflowAction["type"], profiles: ModelProfile[]): WorkflowAction["config"] {
  if (type === "agent") {
    return {
      agent: {
        modelProfileId: profiles[0]?.id ?? null,
        role: "你是一个严谨的任务处理 Agent。",
        prompt: "根据输入 JSON 完成任务，并严格遵守输出格式。",
        inputSource: "previous",
        outputFormat: "json",
        outputSchema: null,
        temperature: 0.2,
        maxOutputTokens: 2048,
        timeoutMs: 60_000,
        retryCount: 1,
      },
    };
  }
  if (type === "save_artifact") return { artifactName: "工作流产物", artifactFormat: "markdown" };
  if (type === "send_feishu_message") return { integrationId: null, integrationTargetId: null, messageTemplate: "{{data}}" };
  if (type === "write_timeline") return { message: "工作流已执行" };
  return {};
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyDraft(): UpsertWorkflowInput {
  const actionId = id("action");
  return {
    name: "",
    enabled: false,
    trigger: { type: "manual", label: triggerLabels.manual, folderId: null },
    conditions: [],
    actions: [{ id: actionId, type: "write_timeline", label: actionLabels.write_timeline, config: { message: "工作流已执行" } }],
    layout: [
      { id: "node-trigger", kind: "trigger", refId: "trigger", x: 32, y: 56 },
      { id: `node-${actionId}`, kind: "action", refId: actionId, x: 276, y: 56 },
    ],
  };
}

function draftFromRule(rule: WorkflowRule): UpsertWorkflowInput {
  return {
    name: rule.name,
    enabled: rule.enabled,
    trigger: { ...rule.trigger },
    conditions: rule.conditions.map((condition) => ({ ...condition })),
    actions: rule.actions.map((action) => ({ ...action, config: { ...action.config } })),
    layout: rule.layout.map((node) => ({ ...node })),
  };
}

export default function WorkflowPage() {
  const { locale, text: t } = usePreferences();
  const folders = useMissionStore((state) => state.folders);
  const workflows = useMissionStore((state) => state.workflows);
  const integrations = useMissionStore((state) => state.integrations);
  const toggle = useMissionStore((state) => state.toggleWorkflow);
  const createWorkflow = useMissionStore((state) => state.createWorkflow);
  const updateWorkflow = useMissionStore((state) => state.updateWorkflow);
  const deleteWorkflow = useMissionStore((state) => state.deleteWorkflow);
  const runWorkflow = useMissionStore((state) => state.runWorkflow);
  const requestCopilotMode = useMissionStore((state) => state.requestCopilotMode);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [draft, setDraft] = useState<UpsertWorkflowInput>(emptyDraft);
  const [selectedNodeId, setSelectedNodeId] = useState("node-trigger");
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);

  useEffect(() => {
    void window.missionConsole.getConfig().then((config) => setModelProfiles(config.models.profiles));
  }, []);

  const enabledCount = workflows.filter((workflow) => workflow.enabled).length;
  const totalRuns = workflows.reduce((sum, workflow) => sum + workflow.runs, 0);

  const openEditor = (rule?: WorkflowRule) => {
    setEditingId(rule?.id ?? "new");
    setDraft(rule ? draftFromRule(rule) : emptyDraft());
    setSelectedNodeId("node-trigger");
    setRuns([]);
    setError("");
    setMessage("");
    if (rule) {
      void window.missionConsole.getWorkflowRuns(rule.id).then(setRuns);
    }
  };

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    const workflow = workflows.find((item) => item.id === editId);
    if (!workflow) return;
    openEditor(workflow);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, workflows]);

  const save = async () => {
    if (busy) return;
    setBusy("save");
    setError("");
    try {
      if (editingId === "new") {
        const created = await createWorkflow(draft);
        setEditingId(created.id);
        setMessage("工作流已创建");
      } else if (editingId) {
        await updateWorkflow(editingId, draft);
        setMessage("工作流已保存");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const run = async (rule: WorkflowRule) => {
    if (busy) return;
    setBusy(`run:${rule.id}`);
    setError("");
    try {
      const result = await runWorkflow(rule.id, rule.trigger.folderId ?? null);
      setMessage(result.status === "success" ? `执行成功：${result.message}` : `执行失败：${result.message}`);
      if (editingId === rule.id) setRuns(await window.missionConsole.getWorkflowRuns(rule.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (rule: WorkflowRule) => {
    if (!window.confirm(`永久删除工作流“${rule.name}”？执行记录也会一并删除。`)) return;
    setBusy(`delete:${rule.id}`);
    try {
      await deleteWorkflow(rule.id);
      if (editingId === rule.id) setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const resumeRun = async (runId: string) => {
    if (busy || !editingId || editingId === "new") return;
    setBusy(`resume:${runId}`);
    setError("");
    try {
      const result = await window.missionConsole.resumeWorkflow(runId);
      setMessage(result.status === "success" ? `恢复执行成功：${result.message}` : `恢复执行失败：${result.message}`);
      setRuns(await window.missionConsole.getWorkflowRuns(editingId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-5 space-y-5 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] text-ink-faint mb-1">{t("编排本地自动化规则", "Build local automation rules")}</p>
          <h1 className="font-display font-semibold text-2xl text-ink">
            {t("工作流", "Workflows")} <span className="text-ink-faint">{enabledCount}/{workflows.length}</span>
          </h1>
          <p className="text-[12px] text-ink-muted mt-1">
            {t(`${enabledCount} 条规则运行中 · 累计真实执行 ${totalRuns} 次`, `${enabledCount} enabled · ${totalRuns} recorded runs`)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => requestCopilotMode("draft")}>
            {t("让 Copilot 创建", "Create with Copilot")}
          </button>
          <button className="btn-phosphor" onClick={() => openEditor()}>
            <Plus className="w-3 h-3" /> {t("手动创建", "Create manually")}
          </button>
        </div>
      </div>

      {(error || message) && (
        <div className={cn("border px-3 py-2 text-[11px]", error ? "border-rose-400/30 bg-rose-400/5 text-rose-300" : "border-jade/30 bg-jade/5 text-jade")}>
          {error || message}
        </div>
      )}

      {editingId && (
        <WorkflowEditor
          draft={draft}
          setDraft={setDraft}
          folders={folders}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
          runs={runs}
          modelProfiles={modelProfiles}
          integrations={integrations}
          saving={busy === "save"}
          resumingRunId={busy?.startsWith("resume:") ? busy.slice("resume:".length) : null}
          onResumeRun={(runId) => void resumeRun(runId)}
          onSave={() => void save()}
          onClose={() => setEditingId(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {workflows.map((workflow, index) => (
          <motion.article
            key={workflow.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.035 }}
            className={cn("panel p-4", workflow.enabled ? "border-phosphor-400/30" : "border-white/5 opacity-75")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 shrink-0 grid place-items-center border border-phosphor-400/30 text-phosphor-400">
                  <WorkflowIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-[13px] text-ink truncate">{workflow.name}</h3>
                  <p className="text-[9px] data-mono text-ink-faint mt-1">RUNS {workflow.runs} · {triggerLabels[workflow.trigger.type]}</p>
                </div>
              </div>
              <button onClick={() => void toggle(workflow.id)} className={cn("relative w-9 h-5 rounded-full", workflow.enabled ? "bg-phosphor-400/30" : "bg-white/8")}>
                <span className={cn("absolute top-0.5 w-4 h-4 rounded-full transition-all", workflow.enabled ? "left-[20px] bg-phosphor-400" : "left-0.5 bg-ink-muted")} />
              </button>
            </div>
            <div className="mt-3 space-y-2 text-[11px] text-ink-muted">
              <FlowSummary icon={Zap} label="触发" value={workflow.trigger.label} />
              {workflow.conditions.length > 0 && <FlowSummary icon={Filter} label="条件" value={`${workflow.conditions.length} 个条件`} />}
              <FlowSummary icon={GitBranch} label="动作" value={workflow.actions.map((action) => actionLabels[action.type]).join(" → ")} />
            </div>
            {workflow.lastStatus === "failed" && <p className="mt-3 text-[10px] text-rose-300">最近失败：{workflow.lastError}</p>}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
              <span className="text-[10px] data-mono text-ink-faint">
                {workflow.enabled ? "RUNNING" : "PAUSED"} · {workflow.lastRun ? relativeTime(workflow.lastRun, locale) : "NEVER"}
              </span>
              <div className="flex items-center gap-1">
                <button className="btn-icon" title="编辑" onClick={() => openEditor(workflow)}><Pencil className="w-3.5 h-3.5" /></button>
                <button className="btn-icon" title="手动运行" disabled={busy !== null} onClick={() => void run(workflow)}>
                  {busy === `run:${workflow.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button className="btn-icon text-rose-300" title="删除" disabled={busy !== null} onClick={() => void remove(workflow)}>
                  {busy === `delete:${workflow.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </motion.article>
        ))}
        {workflows.length === 0 && (
          <button onClick={() => openEditor()} className="panel min-h-40 border-dashed grid place-items-center text-ink-faint hover:text-phosphor-400">
            <span className="flex items-center gap-2"><Plus className="w-4 h-4" />创建第一条本地工作流</span>
          </button>
        )}
      </div>
    </div>
  );
}

function WorkflowEditor({
  draft,
  setDraft,
  folders,
  selectedNodeId,
  setSelectedNodeId,
  runs,
  modelProfiles,
  integrations,
  saving,
  resumingRunId,
  onResumeRun,
  onSave,
  onClose,
}: {
  draft: UpsertWorkflowInput;
  setDraft: React.Dispatch<React.SetStateAction<UpsertWorkflowInput>>;
  folders: ReturnType<typeof useMissionStore.getState>["folders"];
  selectedNodeId: string;
  setSelectedNodeId: (id: string) => void;
  runs: WorkflowRun[];
  modelProfiles: ModelProfile[];
  integrations: IntegrationAdapter[];
  saving: boolean;
  resumingRunId: string | null;
  onResumeRun: (runId: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runSteps, setRunSteps] = useState<WorkflowStepRun[]>([]);
  const selectedLayout = draft.layout.find((node) => node.id === selectedNodeId) ?? null;
  const selectedCondition = selectedLayout?.kind === "condition" ? draft.conditions.find((item) => item.id === selectedLayout.refId) : null;
  const selectedAction = selectedLayout?.kind === "action" ? draft.actions.find((item) => item.id === selectedLayout.refId) : null;

  const orderedNodes = useMemo(() => {
    const refs = ["trigger", ...draft.conditions.map((condition) => condition.id), ...draft.actions.map((action) => action.id)];
    return refs.map((ref) => draft.layout.find((node) => node.refId === ref)).filter((node): node is WorkflowNodeLayout => Boolean(node));
  }, [draft]);

  const addCondition = () => {
    const condition: WorkflowCondition = { id: id("condition"), field: "folder_status", op: "eq", value: "active" };
    setDraft((current) => ({
      ...current,
      conditions: [...current.conditions, condition],
      layout: [...current.layout, { id: `node-${condition.id}`, kind: "condition", refId: condition.id, x: 276, y: 150 + current.conditions.length * 72 }],
    }));
    setSelectedNodeId(`node-${condition.id}`);
  };

  const addAction = (type: WorkflowAction["type"] = "write_timeline") => {
    const action: WorkflowAction = { id: id("action"), type, label: actionLabels[type], config: actionConfig(type, modelProfiles) };
    setDraft((current) => ({
      ...current,
      actions: [...current.actions, action],
      layout: [...current.layout, { id: `node-${action.id}`, kind: "action", refId: action.id, x: 520, y: 56 + current.actions.length * 76 }],
    }));
    setSelectedNodeId(`node-${action.id}`);
  };

  const removeSelected = () => {
    if (!selectedLayout || selectedLayout.kind === "trigger") return;
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.filter((condition) => condition.id !== selectedLayout.refId),
      actions: current.actions.filter((action) => action.id !== selectedLayout.refId),
      layout: current.layout.filter((node) => node.id !== selectedLayout.id),
    }));
    setSelectedNodeId("node-trigger");
  };

  const pointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging || dragging.nodeId !== event.currentTarget.dataset.nodeId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.width - 176, event.clientX - rect.left - dragging.offsetX));
    const y = Math.max(8, Math.min(rect.height - 64, event.clientY - rect.top - dragging.offsetY));
    setDraft((current) => ({ ...current, layout: current.layout.map((node) => node.id === dragging.nodeId ? { ...node, x, y } : node) }));
  };

  return (
    <section className="panel overflow-hidden">
      <header className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="工作流名称" className="input flex-1 max-w-md" />
        <label className="flex items-center gap-2 text-[11px] text-ink-muted">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />保存后启用
        </label>
        <button className="btn-ghost" onClick={onClose}><X className="w-3 h-3" />关闭</button>
        <button className="btn-phosphor" disabled={saving} onClick={onSave}>{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}保存</button>
      </header>
      <div className="grid grid-cols-[180px_minmax(420px,1fr)_270px] min-h-[430px]">
        <aside className="p-3 border-r border-white/5 space-y-3">
          <p className="text-[10px] data-mono text-ink-faint uppercase">本地节点</p>
          <div className="p-2 border border-amber-500/30 text-[11px] text-amber-400 flex items-center gap-2"><Zap className="w-3 h-3" />单一触发器</div>
          <button onClick={addCondition} className="w-full p-2 border border-violet/30 text-[11px] text-violet flex items-center gap-2 hover:bg-violet/5"><Plus className="w-3 h-3" />添加条件</button>
          <button onClick={() => addAction("agent")} className="w-full p-2 border border-phosphor-400/35 text-[11px] text-phosphor-300 flex items-center gap-2 hover:bg-phosphor-400/5"><Plus className="w-3 h-3" />添加 Agent</button>
          <button onClick={() => addAction("save_artifact")} className="w-full p-2 border border-jade/30 text-[11px] text-jade flex items-center gap-2 hover:bg-jade/5"><Plus className="w-3 h-3" />添加保存产物</button>
          <button onClick={() => addAction("send_feishu_message")} className="w-full p-2 border border-sky-400/30 text-[11px] text-sky-300 flex items-center gap-2 hover:bg-sky-400/5"><Plus className="w-3 h-3" />添加飞书消息</button>
          <button onClick={() => addAction()} className="w-full p-2 border border-jade/30 text-[11px] text-jade flex items-center gap-2 hover:bg-jade/5"><Plus className="w-3 h-3" />添加本地动作</button>
          <p className="text-[10px] leading-relaxed text-ink-faint">飞书消息只会发往适配器中已授权的目标群；Gmail 等其他连接器仍未开放。</p>
          <div className="pt-3 border-t border-white/5">
            <p className="text-[10px] data-mono text-ink-faint uppercase flex items-center gap-1"><History className="w-3 h-3" />最近执行</p>
            <div className="mt-2 space-y-2 max-h-48 overflow-auto">
              {runs.map((run) => <div key={run.id} className="text-[9px] border border-white/5 p-2"><div className="flex items-center justify-between gap-2"><span className={run.status === "success" ? "text-jade" : run.status === "running" ? "text-amber-400" : "text-rose-300"}>{run.status.toUpperCase()}</span><div className="flex items-center gap-2"><button type="button" className="text-ink-muted hover:underline" onClick={() => { if (expandedRunId === run.id) { setExpandedRunId(null); setRunSteps([]); } else { setExpandedRunId(run.id); void window.missionConsole.getWorkflowSteps(run.id).then(setRunSteps); } }}>{expandedRunId === run.id ? "收起" : "节点日志"}</button>{(run.status === "failed" || run.status === "interrupted") && <button type="button" className="text-phosphor-300 hover:underline" onClick={() => onResumeRun(run.id)} disabled={Boolean(resumingRunId)}>{resumingRunId === run.id ? "恢复中…" : "断点续跑"}</button>}</div></div><p className="text-ink-faint mt-1 line-clamp-2">{run.message}</p>{expandedRunId === run.id && <div className="mt-2 pt-2 border-t border-white/5 space-y-1.5">{runSteps.map((step) => <div key={step.stepId} className="flex items-start justify-between gap-2"><span className={step.status === "succeeded" ? "text-jade" : step.status === "running" ? "text-amber-400" : "text-rose-300"}>{step.stepId}</span><span className="text-ink-faint">{step.status} · {step.attempts} 次</span></div>)}</div>}</div>)}
              {runs.length === 0 && <p className="text-[10px] text-ink-faint">尚无执行记录</p>}
            </div>
          </div>
        </aside>
        <div ref={canvasRef} className="relative bg-grid-faint bg-[length:24px_24px] overflow-hidden">
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {orderedNodes.slice(0, -1).map((node, index) => {
              const next = orderedNodes[index + 1];
              return <line key={`${node.id}-${next.id}`} x1={node.x + 160} y1={node.y + 28} x2={next.x} y2={next.y + 28} stroke="rgb(var(--phosphor-400))" strokeOpacity="0.35" strokeWidth="1.5" />;
            })}
          </svg>
          {draft.layout.map((node) => {
            const condition = node.kind === "condition" ? draft.conditions.find((item) => item.id === node.refId) : null;
            const action = node.kind === "action" ? draft.actions.find((item) => item.id === node.refId) : null;
            const label = node.kind === "trigger" ? draft.trigger.label : condition ? `${condition.field} ${condition.op}` : action ? action.label : "未知节点";
            return (
              <button
                key={node.id}
                data-node-id={node.id}
                style={{ left: node.x, top: node.y }}
                onClick={() => setSelectedNodeId(node.id)}
                onPointerDown={(event) => {
                  const rect = canvasRef.current!.getBoundingClientRect();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragging({ nodeId: node.id, offsetX: event.clientX - rect.left - node.x, offsetY: event.clientY - rect.top - node.y });
                  setSelectedNodeId(node.id);
                }}
                onPointerMove={pointerMove}
                onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); setDragging(null); }}
                className={cn(
                  "absolute w-40 h-14 px-3 text-left border bg-obsidian-900/95 select-none cursor-grab active:cursor-grabbing",
                  node.kind === "trigger" ? "border-amber-500/50" : node.kind === "condition" ? "border-violet/50" : "border-jade/50",
                  selectedNodeId === node.id && "ring-1 ring-phosphor-400",
                )}
              >
                {node.kind !== "trigger" && <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-phosphor-400 bg-obsidian-900" title="JSON 输入" />}
                {orderedNodes.at(-1)?.id !== node.id && <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-phosphor-400 bg-obsidian-900" title="JSON 输出" />}
                <span className="block text-[9px] uppercase data-mono text-ink-faint">{node.kind}</span>
                <span className="block text-[11px] text-ink truncate mt-1">{label}</span>
              </button>
            );
          })}
        </div>
        <aside className="p-3 border-l border-white/5 overflow-auto">
          <p className="text-[10px] data-mono text-ink-faint uppercase mb-3">节点规则</p>
          {selectedLayout?.kind === "trigger" && <TriggerEditor draft={draft} setDraft={setDraft} folders={folders} />}
          {selectedCondition && <ConditionEditor condition={selectedCondition} setDraft={setDraft} />}
          {selectedAction && <ActionEditor action={selectedAction} setDraft={setDraft} folders={folders} modelProfiles={modelProfiles} integrations={integrations} />}
          {selectedLayout && selectedLayout.kind !== "trigger" && <button onClick={removeSelected} className="btn-ghost text-rose-300 mt-4"><Trash2 className="w-3 h-3" />删除节点</button>}
        </aside>
      </div>
    </section>
  );
}

function TriggerEditor({ draft, setDraft, folders }: { draft: UpsertWorkflowInput; setDraft: React.Dispatch<React.SetStateAction<UpsertWorkflowInput>>; folders: ReturnType<typeof useMissionStore.getState>["folders"] }) {
  return <div className="space-y-3">
    <EditorField label="触发方式"><select className="input" value={draft.trigger.type} onChange={(event) => {
      const type = event.target.value as UpsertWorkflowInput["trigger"]["type"];
      setDraft((current) => ({ ...current, trigger: { ...current.trigger, type, label: triggerLabels[type] } }));
    }}>{Object.entries(triggerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></EditorField>
    <EditorField label="默认任务舱（可选）"><select className="input" value={draft.trigger.folderId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, trigger: { ...current.trigger, folderId: event.target.value || null } }))}><option value="">不绑定；事件触发时可继承事件任务舱</option>{folders.filter((folder) => folder.status !== "archived").map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></EditorField>
    {draft.trigger.type === "schedule" && <EditorField label="间隔（分钟）"><input className="input" type="number" min={5} value={draft.trigger.intervalMin ?? 60} onChange={(event) => setDraft((current) => ({ ...current, trigger: { ...current.trigger, intervalMin: Math.max(5, Number(event.target.value)) } }))} /><p className="text-[9px] text-ink-faint mt-1">纯 Prompt 节点无需任务舱；操作待办、材料或时间线的节点仍需任务舱。</p></EditorField>}
  </div>;
}

function ConditionEditor({ condition, setDraft }: { condition: WorkflowCondition; setDraft: React.Dispatch<React.SetStateAction<UpsertWorkflowInput>> }) {
  const patch = (next: Partial<WorkflowCondition>) => setDraft((current) => ({ ...current, conditions: current.conditions.map((item) => item.id === condition.id ? { ...item, ...next } : item) }));
  return <div className="space-y-3">
    <EditorField label="字段"><select className="input" value={condition.field} onChange={(event) => patch({ field: event.target.value as WorkflowCondition["field"] })}><option value="folder_id">任务舱</option><option value="folder_priority">优先级</option><option value="folder_status">状态</option><option value="assignee">负责人</option><option value="keyword">关键词</option><option value="deadline">截止时间</option></select></EditorField>
    <EditorField label="判断"><select className="input" value={condition.op} onChange={(event) => patch({ op: event.target.value as WorkflowCondition["op"] })}><option value="eq">等于</option><option value="neq">不等于</option><option value="contains">包含</option><option value="before">早于</option><option value="after">晚于</option></select></EditorField>
    <EditorField label="值"><input className="input" value={condition.value} onChange={(event) => patch({ value: event.target.value })} /></EditorField>
  </div>;
}

function ActionEditor({ action, setDraft, folders, modelProfiles, integrations }: { action: WorkflowAction; setDraft: React.Dispatch<React.SetStateAction<UpsertWorkflowInput>>; folders: ReturnType<typeof useMissionStore.getState>["folders"]; modelProfiles: ModelProfile[]; integrations: IntegrationAdapter[] }) {
  const patch = (next: Partial<WorkflowAction>) => setDraft((current) => ({ ...current, actions: current.actions.map((item) => item.id === action.id ? { ...item, ...next } : item) }));
  const patchConfig = (next: Partial<WorkflowAction["config"]>) => patch({ config: { ...action.config, ...next } });
  const patchAgent = (next: Partial<NonNullable<WorkflowAction["config"]["agent"]>>) => patchConfig({ agent: { ...action.config.agent!, ...next } });
  return <div className="space-y-3">
    <EditorField label="节点类型"><select className="input" value={action.type} onChange={(event) => { const type = event.target.value as WorkflowAction["type"]; patch({ type, label: actionLabels[type], config: actionConfig(type, modelProfiles) }); }}>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></EditorField>
    <EditorField label="节点名称"><input className="input" value={action.label} onChange={(event) => patch({ label: event.target.value })} /></EditorField>
    <EditorField label="节点任务舱（可选）"><select className="input" value={action.config.folderId ?? ""} onChange={(event) => patchConfig({ folderId: event.target.value || null })}><option value="">继承默认值或事件；纯 Prompt 可留空</option>{folders.filter((folder) => folder.status !== "archived").map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></EditorField>
    {action.type === "create_todo" && <><EditorField label="待办标题"><input className="input" value={action.config.title ?? ""} onChange={(event) => patchConfig({ title: event.target.value })} /></EditorField><EditorField label="负责人"><select className="input" value={action.config.assignee ?? "human"} onChange={(event) => patchConfig({ assignee: event.target.value as "human" | "agent" })}><option value="human">我</option><option value="agent">Agent</option></select></EditorField></>}
    {action.type === "set_folder_status" && <EditorField label="目标状态"><select className="input" value={action.config.status ?? "active"} onChange={(event) => patchConfig({ status: event.target.value as WorkflowAction["config"]["status"] })}><option value="active">进行中</option><option value="paused">暂停</option><option value="done">完成</option><option value="archived">归档</option></select></EditorField>}
    {(action.type === "write_timeline" || action.type === "notify") && <EditorField label="内容"><textarea className="input min-h-24" value={action.config.message ?? ""} onChange={(event) => patchConfig({ message: event.target.value })} /></EditorField>}
    {action.type === "send_feishu_message" && (() => {
      const feishuAdapters = integrations.filter((item) => item.config.mode === "feishu_app" || item.config.mode === "feishu_webhook");
      const selectedAdapter = feishuAdapters.find((item) => item.id === action.config.integrationId);
      return <>
        <EditorField label="飞书适配器">
          <select className="input" value={action.config.integrationId ?? ""} onChange={(event) => patchConfig({ integrationId: event.target.value || null, integrationTargetId: null })}>
            <option value="">请选择已配置适配器</option>
            {feishuAdapters.map((integration) => <option key={integration.id} value={integration.id}>{integration.name}{integration.status === "connected" ? "" : "（未通过测试）"}</option>)}
          </select>
          {selectedAdapter && selectedAdapter.status !== "connected" && <p className="text-[9px] text-amber-400 mt-1">该适配器尚未通过测试连接，工作流不能启用。</p>}
        </EditorField>
        <EditorField label="授权目标群">
          <select className="input" value={action.config.integrationTargetId ?? ""} onChange={(event) => patchConfig({ integrationTargetId: event.target.value || null })}>
            <option value="">请选择目标群</option>
            {(selectedAdapter?.config.targets ?? []).map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
          </select>
        </EditorField>
        <EditorField label="纯文本消息模板">
          <textarea className="input min-h-28" value={action.config.messageTemplate ?? ""} onChange={(event) => patchConfig({ messageTemplate: event.target.value })} placeholder="例如：文案生成完成：{{data.title}}" />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {["{{data}}", "{{data.title}}", "{{data.content}}", "{{meta.workflowId}}"].map((variable) => <button key={variable} type="button" className="px-1.5 py-1 border border-white/10 text-[9px] data-mono text-ink-faint hover:text-phosphor-300" onClick={() => patchConfig({ messageTemplate: `${action.config.messageTemplate ?? ""}${variable}` })}>{variable}</button>)}
          </div>
          <p className="text-[9px] text-ink-faint mt-1">变量缺失时节点失败且不会发送残缺消息；不支持 JavaScript 表达式。</p>
        </EditorField>
      </>;
    })()}
    {action.type === "agent" && action.config.agent && <>
      <EditorField label="模型配置">
        <select className="input" value={action.config.agent.modelProfileId ?? ""} onChange={(event) => patchAgent({ modelProfileId: event.target.value || null })}>
          <option value="">请选择模型</option>
          {modelProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}{profile.apiKeyConfigured ? "" : "（缺少 Key）"}</option>)}
        </select>
        {action.config.agent.modelProfileId && !modelProfiles.find((profile) => profile.id === action.config.agent?.modelProfileId)?.apiKeyConfigured && <p className="text-[9px] text-amber-400 mt-1">该模型尚未配置 API Key，运行前请<Link to="/settings" className="underline ml-1">前往设置</Link></p>}
      </EditorField>
      <EditorField label="角色"><textarea className="input min-h-20" value={action.config.agent.role} onChange={(event) => patchAgent({ role: event.target.value })} /></EditorField>
      <EditorField label="任务提示词"><textarea className="input min-h-28" value={action.config.agent.prompt} onChange={(event) => patchAgent({ prompt: event.target.value })} /></EditorField>
      <EditorField label="输入来源"><select className="input" value={action.config.agent.inputSource} onChange={(event) => patchAgent({ inputSource: event.target.value as NonNullable<WorkflowAction["config"]["agent"]>["inputSource"] })}><option value="previous">仅 Prompt + 上一节点 JSON（无需任务舱）</option><option value="trigger_materials">触发事件新增图片</option><option value="folder_images">任务舱全部图片</option><option value="selected_materials">指定材料</option></select></EditorField>
      <EditorField label="输出格式"><select className="input" value={action.config.agent.outputFormat} onChange={(event) => patchAgent({ outputFormat: event.target.value as NonNullable<WorkflowAction["config"]["agent"]>["outputFormat"] })}><option value="json">JSON</option><option value="markdown">Markdown</option><option value="text">纯文本</option></select></EditorField>
      {action.config.agent.outputFormat === "json" && <EditorField label="JSON Schema（可选）"><textarea className="input min-h-24 data-mono" value={action.config.agent.outputSchema ? JSON.stringify(action.config.agent.outputSchema, null, 2) : ""} onChange={(event) => { try { patchAgent({ outputSchema: event.target.value.trim() ? JSON.parse(event.target.value) : null }); } catch { /* 保留最后一次合法 Schema */ } }} placeholder='{"type":"object"}' /></EditorField>}
      <div className="grid grid-cols-2 gap-2">
        <EditorField label="Temperature"><input className="input" type="number" min={0} max={2} step={0.1} value={action.config.agent.temperature ?? 0.2} onChange={(event) => patchAgent({ temperature: Number(event.target.value) })} /></EditorField>
        <EditorField label="最大输出 Token"><input className="input" type="number" min={128} value={action.config.agent.maxOutputTokens ?? 2048} onChange={(event) => patchAgent({ maxOutputTokens: Number(event.target.value) })} /></EditorField>
        <EditorField label="超时（秒）"><input className="input" type="number" min={5} value={(action.config.agent.timeoutMs ?? 60_000) / 1000} onChange={(event) => patchAgent({ timeoutMs: Number(event.target.value) * 1000 })} /></EditorField>
        <EditorField label="重试次数"><input className="input" type="number" min={0} max={3} value={action.config.agent.retryCount ?? 1} onChange={(event) => patchAgent({ retryCount: Number(event.target.value) })} /></EditorField>
      </div>
    </>}
    {action.type === "save_artifact" && <>
      <EditorField label="产物名称"><input className="input" value={action.config.artifactName ?? ""} onChange={(event) => patchConfig({ artifactName: event.target.value })} /></EditorField>
      <EditorField label="产物格式"><select className="input" value={action.config.artifactFormat ?? "markdown"} onChange={(event) => patchConfig({ artifactFormat: event.target.value as NonNullable<WorkflowAction["config"]["artifactFormat"]> })}><option value="markdown">Markdown</option><option value="json">JSON</option><option value="text">纯文本</option></select></EditorField>
      <p className="text-[10px] leading-relaxed text-ink-faint">只在该节点执行时写入任务舱材料库；上游 Agent 不会隐式创建文件。</p>
    </>}
    {action.type === "run_agent" && <p className="text-[10px] leading-relaxed text-ink-faint">目标任务舱需已启用 Agent；全局防重入仍然生效。</p>}
  </div>;
}

function EditorField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] text-ink-muted mb-1.5">{label}</span>{children}</label>;
}

function FlowSummary({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string }) {
  return <div className="flex items-center gap-2"><Icon className="w-3 h-3 text-phosphor-400 shrink-0" /><span className="text-[9px] uppercase data-mono text-ink-faint w-8">{label}</span><span className="truncate">{value}</span></div>;
}
