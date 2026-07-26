import { getDb } from "../db/client";
import { createHash } from "node:crypto";
import { AgentConfigRepository } from "../repositories/agentConfigRepository";
import { FolderRepository } from "../repositories/folderRepository";
import { TimelineRepository } from "../repositories/timelineRepository";
import { TodoRepository } from "../repositories/todoRepository";
import {
  WorkflowCheckpointRepository,
  WorkflowRepository,
  WorkflowRunRepository,
  WorkflowStepRunRepository,
  WorkflowVersionRepository,
} from "../repositories/workflowRepository";
import { createTodo, setFolderStatus } from "../services/mutationService";
import type {
  FolderStatus,
  WorkflowDataEnvelope,
  WorkflowGraphNode,
  WorkflowCondition,
  WorkflowRule,
  WorkflowRun,
} from "../../renderer/types";
import { validateLinearWorkflowGraph, workflowGraph } from "./graph";
import { UncertainIntegrationStateError } from "../integrations/feishuConnector";
import {
  onWorkflowEvent,
  withWorkflowTrace,
  type WorkflowEvent,
  type WorkflowTrace,
} from "./events";

export interface WorkflowRuntime {
  runAgent: (folderId: string) => Promise<{ ok: boolean; summary?: string; error?: string }>;
  runAgentNode?: (request: {
    folderId: string;
    node: WorkflowGraphNode;
    input: WorkflowDataEnvelope;
    runId: string;
    stepId: string;
    idempotencyKey: string;
  }) => Promise<{ ok: boolean; output?: WorkflowDataEnvelope; outputRef?: string | null; summary?: string; error?: string }>;
  saveArtifact?: (request: {
    folderId: string;
    node: WorkflowGraphNode;
    input: WorkflowDataEnvelope;
    runId: string;
    stepId: string;
    idempotencyKey: string;
  }) => Promise<{ output: WorkflowDataEnvelope; outputRef?: string | null }>;
  sendIntegrationMessage?: (request: {
    node: WorkflowGraphNode;
    input: WorkflowDataEnvelope;
    runId: string;
    stepId: string;
    idempotencyKey: string;
  }) => Promise<{ integrationId: string; targetId: string; messageLength: number; messageHash: string }>;
  notify: (payload: { title: string; body: string; folderId: string | null }) => void;
  changed: (folderIds: string[]) => void;
}

let runtime: WorkflowRuntime | null = null;
let unsubscribe: (() => void) | null = null;

export function registerWorkflowRuntime(nextRuntime: WorkflowRuntime): () => void {
  runtime = nextRuntime;
  unsubscribe?.();
  unsubscribe = onWorkflowEvent(async (event, trace) => dispatchWorkflowEvent(event, trace));
  return () => {
    unsubscribe?.();
    unsubscribe = null;
    runtime = null;
  };
}

function eventValue(condition: WorkflowCondition, event: WorkflowEvent): string | number | null {
  const folder = event.folderId ? FolderRepository.findById(event.folderId) : null;
  const todo = event.todoId ? TodoRepository.findById(event.todoId) : null;
  switch (condition.field) {
    case "folder_id": return event.folderId;
    case "folder_priority": return folder?.priority ?? null;
    case "folder_status": return event.status ?? folder?.status ?? null;
    case "assignee": return event.assignee ?? todo?.assignee ?? null;
    case "keyword": return event.text ?? todo?.title ?? "";
    case "deadline": return folder?.deadline ?? null;
  }
}

function conditionMatches(condition: WorkflowCondition, event: WorkflowEvent): boolean {
  const actual = eventValue(condition, event);
  if (actual === null) return false;
  switch (condition.op) {
    case "eq": return String(actual) === condition.value;
    case "neq": return String(actual) !== condition.value;
    case "contains": return String(actual).toLocaleLowerCase().includes(condition.value.toLocaleLowerCase());
    case "before": return Number(actual) < Number(condition.value);
    case "after": return Number(actual) > Number(condition.value);
  }
}

function triggerMatches(workflow: WorkflowRule, event: WorkflowEvent): boolean {
  if (!workflow.enabled || workflow.trigger.type !== event.type) return false;
  if (workflow.trigger.folderId && workflow.trigger.folderId !== event.folderId) return false;
  return workflow.conditions.every((condition) => conditionMatches(condition, event));
}

function resolveFolderId(workflow: WorkflowRule, node: WorkflowGraphNode, event: WorkflowEvent): string {
  const folderId = node.config.folderId || event.folderId || workflow.trigger.folderId;
  if (!folderId || !FolderRepository.findById(folderId)) throw new Error("工作流动作缺少有效任务舱");
  return folderId;
}

function appendStepResult(input: WorkflowDataEnvelope, node: WorkflowGraphNode, result: unknown): WorkflowDataEnvelope {
  return {
    ...input,
    data: result,
    meta: { ...input.meta, lastStepId: node.id, lastStepLabel: node.label },
  };
}

async function executeNode(
  workflow: WorkflowRule,
  node: WorkflowGraphNode,
  event: WorkflowEvent,
  input: WorkflowDataEnvelope,
  runId: string,
  idempotencyKey: string,
  changedFolderIds: Set<string>,
): Promise<{ message: string; output: WorkflowDataEnvelope; outputRef?: string | null }> {
  const folderId = resolveFolderId(workflow, node, event);
  changedFolderIds.add(folderId);
  switch (node.type) {
    case "trigger":
      return { message: node.label, output: input };
    case "agent": {
      if (!runtime?.runAgentNode) throw new Error("尚未注册可配置 Agent 节点运行时");
      const result = await runtime.runAgentNode({
        folderId,
        node,
        input,
        runId,
        stepId: node.id,
        idempotencyKey,
      });
      if (!result.ok || !result.output) throw new Error(result.error || `Agent 节点“${node.label}”执行失败`);
      return { message: result.summary || `${node.label} 执行完成`, output: result.output, outputRef: result.outputRef };
    }
    case "create_todo": {
      const title = node.config.title?.trim() || node.label.trim();
      if (!title) throw new Error("创建待办动作缺少标题");
      const source = `workflow:${workflow.id}:${idempotencyKey}`;
      const existing = getDb().prepare("SELECT id FROM todos WHERE source = ? LIMIT 1;").get(source);
      if (!existing) {
        createTodo(folderId, {
          title,
          dueDate: null,
          assignee: node.config.assignee ?? "human",
          source,
        }, "system");
      }
      return { message: `创建待办：${title}`, output: appendStepResult(input, node, { title, source }) };
    }
    case "set_folder_status": {
      const status = node.config.status as FolderStatus | undefined;
      if (!status) throw new Error("修改状态动作缺少目标状态");
      setFolderStatus(folderId, status, "system");
      return { message: `任务舱状态改为 ${status}`, output: appendStepResult(input, node, { status }) };
    }
    case "run_agent": {
      if (!runtime) throw new Error("工作流运行时尚未注册");
      const config = AgentConfigRepository.findByFolder(folderId);
      if (!config?.enabled) throw new Error("目标任务舱的 Agent 未启用");
      const result = await runtime.runAgent(folderId);
      if (!result.ok) throw new Error(result.error || "Agent 执行失败");
      const summary = result.summary || "Agent 执行完成";
      return { message: summary, output: appendStepResult(input, node, { summary }) };
    }
    case "write_timeline": {
      const message = node.config.message?.trim() || node.label;
      const existing = getDb().prepare("SELECT id FROM timeline WHERE meta LIKE ? LIMIT 1;").get(`%"idempotencyKey":"${idempotencyKey}"%`);
      if (!existing) {
        TimelineRepository.insert({
          id: `tl-wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          folderId,
          actor: "system",
          action: message,
          timestamp: Date.now(),
          meta: { workflowId: workflow.id, idempotencyKey },
        });
      }
      return { message, output: appendStepResult(input, node, { message }) };
    }
    case "notify": {
      if (!runtime) throw new Error("工作流运行时尚未注册");
      const message = node.config.message?.trim() || node.label;
      runtime.notify({ title: workflow.name, body: message, folderId });
      return { message: `应用内通知：${message}`, output: appendStepResult(input, node, { message }) };
    }
    case "send_feishu_message": {
      if (!runtime?.sendIntegrationMessage) throw new Error("尚未注册飞书消息连接器");
      const result = await runtime.sendIntegrationMessage({
        node,
        input,
        runId,
        stepId: node.id,
        idempotencyKey,
      });
      return {
        message: "飞书消息发送成功",
        output: appendStepResult(input, node, result),
      };
    }
    case "save_artifact": {
      if (!runtime?.saveArtifact) throw new Error("尚未注册工作流产物存储运行时");
      const result = await runtime.saveArtifact({ folderId, node, input, runId, stepId: node.id, idempotencyKey });
      return { message: `保存产物：${node.config.artifactName || node.label}`, output: result.output, outputRef: result.outputRef };
    }
  }
}

function envelopeHash(envelope: WorkflowDataEnvelope): string {
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

function initialEnvelope(workflow: WorkflowRule, event: WorkflowEvent): WorkflowDataEnvelope {
  return {
    version: 1,
    data: { trigger: event },
    meta: { workflowId: workflow.id, workflowVersion: workflow.version },
  };
}

const WORKFLOW_LEASE_TTL_MS = 60_000;

function uncertainStepRequiresReview(node: WorkflowGraphNode): boolean {
  return node.type === "notify" || node.type === "run_agent" || node.type === "send_feishu_message";
}

async function executePersistedRun(
  workflow: WorkflowRule,
  run: WorkflowRun,
  event: WorkflowEvent,
  trace: WorkflowTrace,
  countRun: boolean,
): Promise<WorkflowRun> {
  const graph = workflowGraph(workflow);
  const { orderedNodes } = validateLinearWorkflowGraph(graph);
  const executableNodes = orderedNodes.filter((node) => node.type !== "trigger");
  const checkpoint = WorkflowCheckpointRepository.find(run.id);
  if (!checkpoint) throw new Error("工作流 Checkpoint 不存在");
  const leaseOwner = `workflow-${process.pid}-${Math.random().toString(36).slice(2, 9)}`;
  if (!WorkflowCheckpointRepository.tryAcquireLease(run.id, leaseOwner, WORKFLOW_LEASE_TTL_MS)) {
    throw new Error("该工作流运行已被另一个进程接管");
  }

  const changedFolderIds = new Set<string>();
  const messages: string[] = [];
  let context = checkpoint.context;
  let activeStepId: string | null = checkpoint.nextStepId;
  const nextTrace: WorkflowTrace = {
    ...trace,
    depth: trace.depth + 1,
    visitedWorkflowIds: [...trace.visitedWorkflowIds, workflow.id],
  };

  try {
    await withWorkflowTrace(nextTrace, async () => {
      for (let index = 0; index < executableNodes.length; index += 1) {
        const node = executableNodes[index];
        const step = WorkflowStepRunRepository.find(run.id, node.id);
        if (!step) throw new Error(`节点“${node.label}”缺少持久化步骤状态`);
        if (step.status === "succeeded" && step.output) {
          context = step.output;
          continue;
        }
        if (step.status === "running" && uncertainStepRequiresReview(node)) {
          const detail = `节点“${node.label}”上次中断时外部状态不确定，需要人工核对后再继续`;
          WorkflowStepRunRepository.markFailed(run.id, node.id, detail, true);
          WorkflowCheckpointRepository.saveBoundary(run.id, context, node.id, "needs_review");
          throw new Error(detail);
        }

        activeStepId = node.id;
        const inputHash = envelopeHash(context);
        WorkflowStepRunRepository.markRunning(run.id, node.id, inputHash);
        const currentStep = WorkflowStepRunRepository.find(run.id, node.id)!;
        const result = await executeNode(workflow, node, event, context, run.id, currentStep.idempotencyKey, changedFolderIds);
        context = result.output;
        messages.push(result.message);
        WorkflowStepRunRepository.markSucceeded(run.id, node.id, context, result.outputRef ?? null);
        const nextStepId = executableNodes[index + 1]?.id ?? null;
        WorkflowCheckpointRepository.saveBoundary(run.id, context, nextStepId, nextStepId ? "running" : "completed");
        activeStepId = nextStepId;
      }
    });
    run.status = "success";
    run.message = messages.join("；") || "工作流执行完成";
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    const uncertain = caught instanceof UncertainIntegrationStateError;
    if (activeStepId) {
      const step = WorkflowStepRunRepository.find(run.id, activeStepId);
      if (step && step.status === "running") WorkflowStepRunRepository.markFailed(run.id, activeStepId, error, uncertain);
    }
    const latestCheckpoint = WorkflowCheckpointRepository.find(run.id);
    if (uncertain) {
      WorkflowCheckpointRepository.saveBoundary(run.id, context, activeStepId, "needs_review");
    } else if (latestCheckpoint?.status !== "needs_review") {
      WorkflowCheckpointRepository.saveBoundary(run.id, context, activeStepId, "failed");
    }
    run.status = "failed";
    run.message = [...messages, error].join("；");
  } finally {
    run.finishedAt = Date.now();
    WorkflowRunRepository.update(run);
    const resultStatus = run.status === "success" ? "success" : "failed";
    const resultError = run.status === "failed" ? run.message : null;
    if (countRun) WorkflowRepository.recordResult(workflow.id, resultStatus, resultError);
    else WorkflowRepository.updateLastResult(workflow.id, resultStatus, resultError);
    WorkflowCheckpointRepository.releaseLease(run.id, leaseOwner);
    runtime?.changed([...changedFolderIds]);
  }
  return run;
}

export async function runWorkflow(
  workflowId: string,
  event: WorkflowEvent,
  trace: WorkflowTrace = {
    chainId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    depth: 0,
    visitedWorkflowIds: [],
  },
): Promise<WorkflowRun> {
  const workflow = WorkflowRepository.findById(workflowId);
  if (!workflow) throw new Error("工作流不存在");
  if (trace.depth >= 8) throw new Error("已阻止超过 8 层的工作流执行链");
  if (trace.visitedWorkflowIds.includes(workflow.id)) throw new Error("已阻止工作流循环执行");
  const graph = workflowGraph(workflow);
  const { orderedNodes } = validateLinearWorkflowGraph(graph);
  // 旧工作流首次运行时把即时转换的图和计划版本快照补写入库，便于进程重启后恢复。
  WorkflowRepository.ensureGraphSnapshot(workflow.id, graph, workflow.version);
  const startedAt = Date.now();
  const run: WorkflowRun = {
    id: `wfr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    workflowId: workflow.id,
    status: "running",
    triggerType: event.type,
    folderId: event.folderId,
    message: "工作流正在执行",
    startedAt,
    finishedAt: startedAt,
    planVersion: workflow.version,
    resumedFromRunId: null,
  };
  const db = getDb();
  db.exec("BEGIN;");
  try {
    WorkflowRunRepository.insert(run);
    const executableStepIds = orderedNodes.filter((node) => node.type !== "trigger").map((node) => node.id);
    WorkflowStepRunRepository.initialize(run.id, executableStepIds);
    WorkflowCheckpointRepository.create({
      runId: run.id,
      workflowId: workflow.id,
      planVersion: workflow.version,
      event: event as unknown as Record<string, unknown>,
      context: initialEnvelope(workflow, event),
      nextStepId: executableStepIds[0] ?? null,
      status: "running",
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: Date.now(),
    });
    db.exec("COMMIT;");
  } catch (caught) {
    db.exec("ROLLBACK;");
    throw caught;
  }
  return executePersistedRun(workflow, run, event, trace, true);
}

/** 使用原计划版本和原 runId 从最后一个稳定业务边界继续。 */
export async function resumeWorkflowRun(runId: string): Promise<WorkflowRun> {
  const run = WorkflowRunRepository.findById(runId);
  const checkpoint = WorkflowCheckpointRepository.find(runId);
  if (!run || !checkpoint) throw new Error("找不到可恢复的工作流运行");
  if (checkpoint.status === "completed") return run;
  if (checkpoint.status === "needs_review") throw new Error("该运行包含状态不确定的副作用节点，需要人工核对");
  const current = WorkflowRepository.findById(run.workflowId);
  if (!current) throw new Error("工作流已不存在，无法恢复");
  const originalGraph = WorkflowVersionRepository.findGraph(run.workflowId, checkpoint.planVersion);
  if (!originalGraph) throw new Error("找不到运行时使用的工作流计划版本");
  const workflow: WorkflowRule = { ...current, graph: originalGraph, version: checkpoint.planVersion };
  const event = checkpoint.event as unknown as WorkflowEvent;
  run.status = "running";
  run.message = "正在从 Checkpoint 恢复";
  WorkflowRunRepository.update(run);
  return executePersistedRun(workflow, run, event, {
    chainId: `resume-${run.id}`,
    depth: 0,
    visitedWorkflowIds: [],
  }, false);
}

export async function dispatchWorkflowEvent(event: WorkflowEvent, trace: WorkflowTrace): Promise<void> {
  const workflows = WorkflowRepository.list().filter((workflow) => triggerMatches(workflow, event));
  for (const workflow of workflows) {
    if (trace.visitedWorkflowIds.includes(workflow.id)) continue;
    const run = await runWorkflow(workflow.id, event, trace);
    if (run.status === "failed") console.error(`[workflow] ${workflow.name} 执行失败：${run.message}`);
  }
}

export async function runDueScheduledWorkflows(now = Date.now()): Promise<WorkflowRun[]> {
  const due = WorkflowRepository.list().filter((workflow) => {
    if (!workflow.enabled || workflow.trigger.type !== "schedule") return false;
    const intervalMs = Math.max(5, workflow.trigger.intervalMin ?? 60) * 60_000;
    return workflow.lastRun === null || now - workflow.lastRun >= intervalMs;
  });
  const results: WorkflowRun[] = [];
  for (const workflow of due) {
    results.push(await runWorkflow(workflow.id, {
      type: "schedule",
      folderId: workflow.trigger.folderId ?? null,
      timestamp: now,
    }));
  }
  return results;
}
