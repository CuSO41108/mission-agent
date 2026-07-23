import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  Clock3,
  Eye,
  FileOutput,
  FolderOpen,
  ListPlus,
  Loader2,
  PencilLine,
  PlayCircle,
  Power,
  Settings2,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  AgentConfig,
  AgentTaskType,
  TaskFolder,
  WorkflowRun,
} from "@/types";
import type { AgentRunRecord } from "../../../core/agent";
import { useMissionStore } from "@/store/useMissionStore";
import { flattenTodos } from "@/lib/missionStats";
import { relativeTime, shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";

interface SchedulerStatus {
  scheduled: boolean;
  running: boolean;
  intervalMin: number;
  nextRunAt: number | null;
}

interface AgentControlPanelProps {
  folder: TaskFolder;
}

const TASK_LABELS: Record<AgentTaskType, string> = {
  analysis: "分析建议",
  artifact: "生成本地产物",
  follow_up: "应用内跟进提醒",
  material_organize: "整理本地材料",
  progress_summary: "生成进度摘要",
  workflow: "执行工作流",
};

const ARTIFACT_TASKS = new Set<AgentTaskType>([
  "artifact",
  "material_organize",
  "progress_summary",
]);

export default function AgentControlPanel({ folder }: AgentControlPanelProps) {
  const { locale, text: t } = usePreferences();
  const config = folder.agentConfig;
  const toggleAgent = useMissionStore((state) => state.toggleAgent);
  const updateAgentConfig = useMissionStore((state) => state.updateAgentConfig);
  const runAgentOnce = useMissionStore((state) => state.runAgentOnce);
  const workflows = useMissionStore((state) => state.workflows);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunRecord[]>([]);
  const [modelStatus, setModelStatus] = useState<{ loaded: boolean; configured: boolean; model: string }>({
    loaded: false,
    configured: false,
    model: "",
  });

  const pendingTodo = useMemo(
    () => flattenTodos(folder.todos).find((todo) => todo.assignee === "agent" && !todo.done) ?? null,
    [folder.todos],
  );
  const taskType = pendingTodo?.agentTaskType ?? "analysis";
  const writesArtifact = Boolean(pendingTodo && ARTIFACT_TASKS.has(taskType));
  const selectedWorkflowId = pendingTodo?.agentTaskType === "workflow"
    ? pendingTodo.workflowId ?? null
    : !pendingTodo && config.strategy === "custom"
      ? config.workflowId ?? null
      : null;
  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null;
  const usesWorkflow = taskType === "workflow" || (!pendingTodo && config.strategy === "custom");
  const requiresModel = !usesWorkflow;

  const latestAgentEvent = useMemo(
    () => [...folder.timeline]
      .filter((entry) => entry.actor === "agent" || typeof entry.meta?.errorCode === "string")
      .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null,
    [folder.timeline],
  );
  const latestRunFailed = typeof latestAgentEvent?.meta?.errorCode === "string";
  const latestArtifact = useMemo(
    () => [...folder.materials]
      .filter((material) => material.sourceIntegration === "agent")
      .sort((left, right) => right.addedAt - left.addedAt)[0] ?? null,
    [folder.materials],
  );

  const requiredPermissions = useMemo(() => {
    const required: Array<keyof AgentConfig["permissions"]> = [];
    if (!usesWorkflow) required.push("read");
    if (pendingTodo && taskType !== "analysis") required.push("write");
    if (pendingTodo && taskType === "follow_up") required.push("notify");
    return required;
  }, [pendingTodo, taskType, usesWorkflow]);
  const missingPermissions = requiredPermissions.filter((permission) => !config.permissions[permission]);

  const executionBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (folder.status !== "active") blockers.push(t("任务舱不是进行中状态", "Folder is not active"));
    if (!config.enabled) blockers.push(t("Agent 托管尚未开启", "Agent control is disabled"));
    if (missingPermissions.length > 0) {
      const permissionNames = {
        read: t("读取", "Read"),
        write: t("写入", "Write"),
        notify: t("通知", "Notify"),
        create_subtask: t("建子任务", "Create subtask"),
      };
      blockers.push(t(
        `缺少权限：${missingPermissions.map((permission) => permissionNames[permission]).join("、")}`,
        `Missing permissions: ${missingPermissions.map((permission) => permissionNames[permission]).join(", ")}`,
      ));
    }
    if (usesWorkflow && !selectedWorkflow) blockers.push(t("没有绑定可执行工作流", "No workflow is bound"));
    if (requiresModel && modelStatus.loaded && !modelStatus.configured) blockers.push(t("尚未配置模型 API Key", "Model API key is not configured"));
    if (requiresModel && !modelStatus.loaded) blockers.push(t("正在确认模型配置", "Checking model configuration"));
    return blockers;
  }, [config.enabled, folder.status, missingPermissions, modelStatus, requiresModel, selectedWorkflow, t, usesWorkflow]);

  const loadScheduler = useCallback(async () => {
    try {
      setScheduler(await window.missionConsole.getSchedulerStatus());
    } catch {
      setScheduler(null);
    }
  }, []);

  const loadModelStatus = useCallback(async () => {
    try {
      const appConfig = await window.missionConsole.getConfig();
      setModelStatus({
        loaded: true,
        configured: Boolean(appConfig.deepseek.apiKeyConfigured),
        model: appConfig.deepseek.model,
      });
    } catch {
      setModelStatus({ loaded: true, configured: false, model: "" });
    }
  }, []);

  const loadWorkflowRuns = useCallback(async () => {
    if (!selectedWorkflowId) {
      setWorkflowRuns([]);
      return;
    }
    try {
      const runs = await window.missionConsole.getWorkflowRuns(selectedWorkflowId);
      setWorkflowRuns(runs.filter((run) => !run.folderId || run.folderId === folder.id));
    } catch {
      setWorkflowRuns([]);
    }
  }, [folder.id, selectedWorkflowId]);

  const loadAgentRuns = useCallback(async () => {
    try {
      setAgentRuns(await window.missionConsole.getAgentRuns(folder.id, 8));
    } catch {
      setAgentRuns([]);
    }
  }, [folder.id]);

  useEffect(() => {
    void Promise.all([loadScheduler(), loadModelStatus(), loadAgentRuns()]);
    const timer = window.setInterval(() => void Promise.all([loadScheduler(), loadModelStatus(), loadAgentRuns()]), 2_000);
    return () => window.clearInterval(timer);
  }, [loadAgentRuns, loadModelStatus, loadScheduler]);

  useEffect(() => {
    void loadWorkflowRuns();
  }, [loadWorkflowRuns]);

  const runNow = async () => {
    if (running || executionBlockers.length > 0) return;
    setRunning(true);
    setRunMessage("");
    try {
      const result = await runAgentOnce(folder.id);
      setRunMessage(result.ok
        ? result.summary ?? t("执行完成，结果已写入时间线。", "Completed. The result was added to the timeline.")
        : result.error ?? t("执行失败", "Failed"));
      await Promise.all([loadScheduler(), loadWorkflowRuns(), loadAgentRuns()]);
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  const applyRequiredPermissions = async () => {
    const permissions = Object.fromEntries(missingPermissions.map((permission) => [permission, true]));
    try {
      await updateAgentConfig(folder.id, { permissions });
      setRunMessage(t("已补齐当前任务所需权限，可以立即执行。", "Required permissions enabled. You can run the Agent now."));
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const openOutput = async (reveal = false) => {
    if (!latestArtifact) return;
    const result = reveal
      ? await window.missionConsole.revealMaterial(folder.id, latestArtifact.id)
      : await window.missionConsole.openMaterial(folder.id, latestArtifact.id);
    if (!result.ok) setRunMessage(result.error);
  };

  const strategies: { key: AgentConfig["strategy"]; label: string }[] = [
    { key: "follow_up", label: t("跟进提醒", "Follow up") },
    { key: "material_collect", label: t("材料检查", "Check materials") },
    { key: "progress_sync", label: t("进度摘要", "Progress summary") },
    { key: "custom", label: t("自定义工作流", "Custom workflow") },
  ];
  const permissions = [
    { key: "read", label: t("读取", "Read"), icon: Eye },
    { key: "write", label: t("写入", "Write"), icon: PencilLine },
    { key: "notify", label: t("通知", "Notify"), icon: Bell },
    { key: "create_subtask", label: t("建子任务", "Create subtask"), icon: ListPlus },
  ] as const;
  const latestWorkflowRun = workflowRuns[0] ?? null;
  const activeFolderRun = agentRuns.find((run) => run.status === "queued" || run.status === "running") ?? null;

  const statusTitle = activeFolderRun?.status === "queued"
    ? t("已排队，等待资源", "Queued for resources")
    : running || activeFolderRun?.status === "running"
      ? t("正在执行", "Running")
    : latestRunFailed
      ? t("最近执行失败", "Last run failed")
      : latestAgentEvent
        ? t("最近执行成功", "Last run succeeded")
        : config.enabled
          ? t("等待首次执行", "Waiting for first run")
          : t("尚未启用托管", "Agent disabled");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={cn(
            "relative w-6 h-6 flex items-center justify-center border",
            config.enabled ? "border-phosphor-400/50 bg-phosphor-400/10" : "border-ink-faint/30 bg-white/3",
          )}>
            <Bot className={cn("w-3 h-3", config.enabled ? "text-phosphor-400" : "text-ink-faint")} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="font-display text-[11px] font-semibold text-ink leading-none">
              {t("Agent 托管", "Agent control")}
            </h3>
            <p className="text-[9px] text-ink-faint mt-1">
              {config.enabled ? t("已加入自动调度", "Automatic scheduling enabled") : t("不会自动执行", "Will not run automatically")}
            </p>
          </div>
        </div>
        <button
          type="button"
          title={config.enabled ? t("关闭自动托管", "Disable automatic control") : t("开启自动托管", "Enable automatic control")}
          onClick={() => void toggleAgent(folder.id)}
          className={cn("relative w-10 h-5 rounded-full transition-colors", config.enabled ? "bg-phosphor-400/30" : "bg-white/8")}
        >
          <span className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full transition-all",
            config.enabled ? "left-[22px] bg-phosphor-400 shadow-glow-phosphor" : "left-0.5 bg-ink-muted",
          )} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className={cn(
          "px-3 py-2.5 border",
          latestRunFailed ? "border-coral/30 bg-coral/5" : running || activeFolderRun ? "border-phosphor-400/35 bg-phosphor-400/5" : "border-white/8 bg-obsidian-950/30",
        )}>
          <div className="flex items-center gap-2">
            {latestRunFailed
              ? <XCircle className="w-3.5 h-3.5 text-coral" />
              : running || activeFolderRun
                ? <Loader2 className="w-3.5 h-3.5 text-phosphor-400 animate-spin" />
                : <Activity className="w-3.5 h-3.5 text-jade" />}
            <span className="text-[12px] font-medium text-ink">{statusTitle}</span>
            {latestAgentEvent && <span className="ml-auto text-[9px] text-ink-faint">{relativeTime(latestAgentEvent.timestamp, locale)}</span>}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-muted">
            {latestAgentEvent?.action ?? (config.enabled
              ? t("开启托管不会立即执行；你可以现在运行，或等待下一次心跳。", "Enabling control does not run immediately. Run now or wait for the next heartbeat.")
              : t("开启后才会进入自动心跳队列。", "Enable control to join the heartbeat queue."))}
          </p>
          {config.enabled && (
            <p className="mt-1 flex items-center gap-1 text-[9px] text-ink-faint">
              <Clock3 className="w-2.5 h-2.5" />
              {scheduler?.scheduled && scheduler.nextRunAt
                ? t(`下次自动巡检 ${relativeTime(scheduler.nextRunAt, locale)}，间隔 ${scheduler.intervalMin} 分钟`, `Next automatic scan ${relativeTime(scheduler.nextRunAt, locale)}; interval ${scheduler.intervalMin} minutes`)
                : t("自动调度当前未运行，可使用下方按钮手动执行。", "Automatic scheduling is not running; use the button below.")}
            </p>
          )}
        </div>

        {executionBlockers.length > 0 && (
          <div className="px-3 py-2.5 border border-coral/30 bg-coral/5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-coral shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-coral">{t("暂时无法执行", "Cannot run yet")}</p>
                <ul className="mt-1 space-y-0.5 text-[10px] text-ink-muted">
                  {executionBlockers.map((blocker) => <li key={blocker}>· {blocker}</li>)}
                </ul>
                <div className="flex flex-wrap gap-3 mt-2">
                  {missingPermissions.length > 0 && config.enabled && (
                    <button type="button" onClick={() => void applyRequiredPermissions()} className="text-[10px] text-phosphor-600 hover:underline">
                      {t("补齐所需权限", "Enable required permissions")}
                    </button>
                  )}
                  {requiresModel && modelStatus.loaded && !modelStatus.configured && (
                    <Link to="/settings" className="text-[10px] text-phosphor-600 hover:underline">
                      {t("前往模型设置", "Open model settings")}
                    </Link>
                  )}
                  {usesWorkflow && !selectedWorkflow && (
                    <Link to="/workflow" className="text-[10px] text-phosphor-600 hover:underline">
                      {t("前往工作流", "Open workflows")}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => void runNow()}
          disabled={running || Boolean(activeFolderRun) || executionBlockers.length > 0}
          className="btn-phosphor w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
          {running
            ? t("Agent 执行中…", "Agent running…")
            : pendingTodo
              ? t("立即执行当前任务", "Run current task now")
              : t("立即执行托管巡检", "Run managed scan now")}
        </button>
        {runMessage && <p className="px-2 py-1.5 text-[10px] leading-relaxed text-ink-muted border border-white/5">{runMessage}</p>}

        <section className="px-3 py-2.5 border border-white/8">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
              <Activity className="w-3 h-3 text-violet" /> {t("最近 Run", "Recent Runs")}
            </div>
            <Link to="/agents" className="text-[9px] text-phosphor-600 hover:underline">
              {t("打开运行控制台", "Open Run console")}
            </Link>
          </div>
          <div className="mt-2 space-y-1">
            {agentRuns.slice(0, 5).map((run) => (
              <div key={run.id} className="flex items-center gap-2 text-[9px] data-mono text-ink-faint">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  run.status === "succeeded" ? "bg-jade" : run.status === "failed" ? "bg-coral" : run.status === "cancelled" ? "bg-ink-faint" : "bg-amber-400",
                )} />
                <span className="uppercase">{run.status}</span>
                <span>· {run.source}</span>
                <span className="ml-auto">{shortTime(run.queuedAt)}</span>
              </div>
            ))}
            {agentRuns.length === 0 && (
              <p className="text-[9px] text-ink-faint">{t("还没有持久化运行记录", "No persisted Run history yet")}</p>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-2">
          <section className="px-3 py-2.5 border border-white/8">
            <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
              <Zap className="w-3 h-3 text-amber-400" /> {t("当前任务", "Current task")}
            </div>
            {pendingTodo ? (
              <>
                <p className="mt-1.5 text-[11px] text-ink leading-snug">{pendingTodo.title}</p>
                <p className="mt-1 text-[9px] text-ink-faint">
                  {TASK_LABELS[taskType]} · {taskType === "analysis"
                    ? t("只给出分析，不自动完成、不生成文件", "Analysis only; no auto-completion or file")
                    : writesArtifact
                      ? t(`成功后完成待办，并生成 ${pendingTodo.artifactFormat ?? "markdown"} 文件`, `Completes the todo and creates a ${pendingTodo.artifactFormat ?? "markdown"} file`)
                      : t("成功后完成待办", "Completes the todo on success")}
                </p>
                <p className="mt-1 text-[9px] text-ink-faint">
                  {usesWorkflow
                    ? t("本次交给工作流执行；工作流若包含“运行 Agent”节点，才可能请求模型。", "Runs through the workflow; a model may be requested only if it contains a Run Agent node.")
                    : modelStatus.configured
                      ? t(`本次会请求模型 API（${modelStatus.model || "当前模型"}）。`, `This run will call the model API (${modelStatus.model || "current model"}).`)
                      : t("本任务需要模型 API，但当前尚未配置。", "This task needs a model API, which is not configured.")}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-[10px] text-ink-muted">{t("没有未完成的 Agent 待办；运行时只执行托管策略巡检。", "No pending Agent todo; runs only perform the selected strategy scan.")}</p>
                <p className="mt-1 text-[9px] text-ink-faint">
                  {usesWorkflow
                    ? t("将执行默认工作流，是否请求模型由工作流节点决定。", "Runs the default workflow; model usage depends on its nodes.")
                    : t("巡检会请求模型，但通常只写时间线，不会改变待办进度。", "The scan calls the model but normally only writes to the timeline and does not change todo progress.")}
                </p>
              </>
            )}
          </section>

          <section className="px-3 py-2.5 border border-white/8">
            <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
              <Workflow className="w-3 h-3 text-violet" /> {t("工作流", "Workflow")}
            </div>
            {selectedWorkflow ? (
              <>
                <p className="mt-1.5 text-[11px] text-ink">{selectedWorkflow.name}</p>
                <p className="mt-1 text-[9px] text-ink-faint">
                  {latestWorkflowRun
                    ? t(`最近一次：${latestWorkflowRun.status === "success" ? "成功" : "失败"} · ${relativeTime(latestWorkflowRun.finishedAt, locale)}`, `Last run: ${latestWorkflowRun.status} · ${relativeTime(latestWorkflowRun.finishedAt, locale)}`)
                    : t("尚未执行过", "Never run")}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-[10px] text-ink-muted">
                {t("当前任务不会调用工作流；工作流页面里的“启用”不等于已绑定到本任务。", "This task will not call a workflow. Enabling a workflow does not bind it to this task.")}
              </p>
            )}
            <Link to="/workflow" className="inline-block mt-1.5 text-[9px] text-phosphor-600 hover:underline">
              {t("查看工作流运行记录", "View workflow history")}
            </Link>
          </section>

          <section className="px-3 py-2.5 border border-white/8">
            <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
              <FileOutput className="w-3 h-3 text-jade" /> {t("输出文件", "Output file")}
            </div>
            {latestArtifact ? (
              <>
                <p className="mt-1.5 text-[11px] text-ink truncate" title={latestArtifact.name}>{latestArtifact.name}</p>
                <p className="mt-1 text-[9px] text-ink-faint">{t(`已回挂到材料库 · ${shortTime(latestArtifact.addedAt)}`, `Saved in Materials · ${shortTime(latestArtifact.addedAt)}`)}</p>
                <div className="flex gap-3 mt-1.5">
                  <button type="button" onClick={() => void openOutput()} className="text-[9px] text-phosphor-600 hover:underline">{t("打开文件", "Open")}</button>
                  <button type="button" onClick={() => void openOutput(true)} className="flex items-center gap-1 text-[9px] text-phosphor-600 hover:underline"><FolderOpen className="w-2.5 h-2.5" />{t("定位文件", "Show in folder")}</button>
                </div>
              </>
            ) : (
              <p className="mt-1.5 text-[10px] text-ink-muted">
                {writesArtifact
                  ? t("尚无输出；成功执行后会自动出现在材料库。", "No output yet. A successful run will add it to Materials.")
                  : t("当前任务类型不会生成文件。", "The current task type does not create a file.")}
              </p>
            )}
          </section>
        </div>

        <details className="border border-white/8">
          <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2 text-[10px] text-ink-muted hover:text-ink">
            <Settings2 className="w-3 h-3" /> {t("高级设置：策略、工作流与权限", "Advanced: strategy, workflow, permissions")}
          </summary>
          <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
            <div>
              <label className="text-[9px] text-ink-faint">{t("无待办时的巡检策略", "Scan strategy when no todo is pending")}</label>
              <select
                className="input w-full mt-1"
                disabled={!config.enabled}
                value={config.strategy}
                onChange={(event) => void updateAgentConfig(folder.id, { strategy: event.target.value as AgentConfig["strategy"] })}
              >
                {strategies.map((strategy) => <option key={strategy.key} value={strategy.key}>{strategy.label}</option>)}
              </select>
            </div>
            {config.strategy === "custom" && (
              <div>
                <label className="text-[9px] text-ink-faint">{t("默认工作流", "Default workflow")}</label>
                <select
                  className="input w-full mt-1"
                  disabled={!config.enabled}
                  value={config.workflowId ?? ""}
                  onChange={(event) => void updateAgentConfig(folder.id, { workflowId: event.target.value || null })}
                >
                  <option value="">{t("选择工作流", "Select workflow")}</option>
                  {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {permissions.map((permission) => {
                const enabled = config.permissions[permission.key];
                return (
                  <button
                    key={permission.key}
                    type="button"
                    disabled={!config.enabled}
                    onClick={() => void updateAgentConfig(folder.id, { permissions: { [permission.key]: !enabled } })}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 border text-left",
                      enabled ? "border-phosphor-400/30 bg-phosphor-400/5" : "border-white/5 opacity-50",
                    )}
                  >
                    <permission.icon className="w-3 h-3 text-phosphor-400" />
                    <span className="text-[10px] text-ink-muted">{permission.label}</span>
                    {enabled ? <CheckCircle2 className="ml-auto w-3 h-3 text-jade" /> : <Power className="ml-auto w-3 h-3 text-ink-faint" />}
                  </button>
                );
              })}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
