// Workflow Service · 工作流业务层

import { WorkflowRepository, WorkflowRunRepository } from "../repositories/workflowRepository";
import { getDb } from "../db/client";
import type { UpsertWorkflowInput, WorkflowRule, WorkflowRun } from "../../renderer/types";
import { graphFromLegacy, validateLinearWorkflowGraph } from "../workflow/graph";

export function getAllWorkflows(): WorkflowRule[] {
  return WorkflowRepository.list();
}

export function getWorkflowById(id: string): WorkflowRule | null {
  return WorkflowRepository.findById(id);
}

function validateInput(input: UpsertWorkflowInput): UpsertWorkflowInput {
  const name = input.name.trim();
  if (!name) throw new Error("工作流名称不能为空");
  if (!input.trigger?.type) throw new Error("工作流必须包含触发器");
  if (input.trigger.type === "schedule" && !input.trigger.folderId) {
    throw new Error("定时工作流必须选择目标任务舱");
  }
  if (input.trigger.type === "schedule" && (input.trigger.intervalMin ?? 0) < 5) {
    throw new Error("定时工作流间隔不能少于 5 分钟");
  }
  if (input.actions.length === 0) throw new Error("工作流至少需要一个动作");
  const nodeIds = new Set<string>();
  for (const node of input.layout) {
    if (nodeIds.has(node.id)) throw new Error("工作流节点 ID 重复");
    nodeIds.add(node.id);
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new Error("工作流节点位置无效");
  }
  const layoutRefs = new Set(input.layout.map((node) => `${node.kind}:${node.refId}`));
  if (!layoutRefs.has("trigger:trigger")) throw new Error("工作流画布缺少触发器节点");
  for (const condition of input.conditions) {
    if (!condition.value.trim()) throw new Error("条件值不能为空");
    if (!layoutRefs.has(`condition:${condition.id}`)) throw new Error("条件节点未加入画布");
  }
  for (const action of input.actions) {
    if (!layoutRefs.has(`action:${action.id}`)) throw new Error("动作节点未加入画布");
    if (action.type === "create_todo" && !action.config.title?.trim()) throw new Error("创建待办动作缺少标题");
    if (action.type === "set_folder_status" && !action.config.status) throw new Error("修改状态动作缺少目标状态");
    if ((action.type === "notify" || action.type === "write_timeline") && !action.config.message?.trim()) {
      throw new Error("通知或时间线动作缺少内容");
    }
    if (action.type === "agent") {
      const agent = action.config.agent;
      if (!agent) throw new Error(`Agent 节点“${action.label}”缺少配置`);
      if (input.enabled && !agent.modelProfileId) throw new Error(`Agent 节点“${action.label}”尚未选择模型配置`);
      if (!agent.role.trim() || !agent.prompt.trim()) throw new Error(`Agent 节点“${action.label}”缺少角色或提示词`);
    }
    if (action.type === "save_artifact" && !action.config.artifactName?.trim()) {
      throw new Error(`保存产物节点“${action.label}”缺少产物名称`);
    }
  }
  const graph = input.graph ?? graphFromLegacy(input);
  const { orderedNodes } = validateLinearWorkflowGraph(graph);
  for (const node of orderedNodes) {
    if (node.type === "agent") {
      const agent = node.config.agent;
      if (!agent) throw new Error(`Agent 节点“${node.label}”缺少配置`);
      if (!agent.role.trim() || !agent.prompt.trim()) throw new Error(`Agent 节点“${node.label}”缺少角色或提示词`);
      if (input.enabled && !agent.modelProfileId) throw new Error(`Agent 节点“${node.label}”尚未选择模型配置`);
    }
    if (node.type === "save_artifact" && !node.config.artifactName?.trim()) {
      throw new Error(`保存产物节点“${node.label}”缺少产物名称`);
    }
  }
  return { ...input, name, graph };
}

export function createWorkflow(input: UpsertWorkflowInput): WorkflowRule {
  const valid = validateInput(input);
  const workflow: WorkflowRule = {
    id: `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ...valid,
    graph: valid.graph!,
    version: 1,
    runs: 0,
    lastRun: null,
    lastStatus: null,
    lastError: null,
  };
  WorkflowRepository.insert(workflow);
  return workflow;
}

export function updateWorkflow(id: string, input: UpsertWorkflowInput): WorkflowRule {
  const existing = WorkflowRepository.findById(id);
  if (!existing) throw new Error("工作流不存在");
  const valid = validateInput(input);
  const workflow: WorkflowRule = { ...existing, ...valid, graph: valid.graph!, version: existing.version + 1, id };
  WorkflowRepository.insert(workflow);
  return workflow;
}

export function deleteWorkflow(id: string): boolean {
  const db = getDb();
  db.exec("BEGIN;");
  try {
    db.prepare("UPDATE todos SET workflow_id = NULL WHERE workflow_id = ?;").run(id);
    db.prepare("UPDATE agent_configs SET workflow_id = NULL WHERE workflow_id = ?;").run(id);
    db.prepare("DELETE FROM workflow_runs WHERE workflow_id = ?;").run(id);
    const deleted = WorkflowRepository.delete(id);
    db.exec("COMMIT;");
    return deleted;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function getWorkflowRuns(id: string): WorkflowRun[] {
  return WorkflowRunRepository.listByWorkflow(id);
}
