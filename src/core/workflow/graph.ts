import type {
  UpsertWorkflowInput,
  WorkflowAction,
  WorkflowDataEdge,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGraphNodeType,
  WorkflowRule,
} from "../../renderer/types";

function edgeId(sourceNodeId: string, targetNodeId: string): string {
  return `edge-${sourceNodeId}-${targetNodeId}`;
}

function actionNodeType(action: WorkflowAction): WorkflowGraphNodeType {
  return action.type;
}

/** 把旧的 trigger + ordered actions 非破坏地转换为单链路数据流图。 */
export function graphFromLegacy(
  workflow: Pick<UpsertWorkflowInput, "trigger" | "actions" | "layout">,
): WorkflowGraph {
  const triggerLayout = workflow.layout.find((item) => item.kind === "trigger");
  const triggerNode: WorkflowGraphNode = {
    id: "trigger",
    type: "trigger",
    label: workflow.trigger.label,
    x: triggerLayout?.x ?? 32,
    y: triggerLayout?.y ?? 56,
    config: { folderId: workflow.trigger.folderId ?? null },
  };
  const actionNodes = workflow.actions.map((action, index): WorkflowGraphNode => {
    const layout = workflow.layout.find((item) => item.kind === "action" && item.refId === action.id);
    return {
      id: action.id,
      type: actionNodeType(action),
      label: action.label,
      x: layout?.x ?? 276 + index * 244,
      y: layout?.y ?? 56,
      config: { ...action.config },
    };
  });
  const nodes = [triggerNode, ...actionNodes];
  const edges: WorkflowDataEdge[] = nodes.slice(0, -1).map((node, index) => ({
    id: edgeId(node.id, nodes[index + 1].id),
    sourceNodeId: node.id,
    sourcePort: "output",
    targetNodeId: nodes[index + 1].id,
    targetPort: "input",
  }));
  return { schemaVersion: 1, nodes, edges };
}

export function workflowGraph(workflow: Pick<WorkflowRule, "graph" | "trigger" | "actions" | "layout">): WorkflowGraph {
  return workflow.graph?.nodes?.length ? workflow.graph : graphFromLegacy(workflow);
}

export interface LinearGraphValidation {
  orderedNodes: WorkflowGraphNode[];
}

/**
 * 第一阶段只接受一个入口、无环、无分支、无汇合的数据链。
 * 数据边同时承担执行顺序，避免控制边与数据边产生双重语义。
 */
export function validateLinearWorkflowGraph(graph: WorkflowGraph): LinearGraphValidation {
  if (graph.schemaVersion !== 1) throw new Error("不支持的工作流图版本");
  if (!Array.isArray(graph.nodes) || graph.nodes.length < 2) throw new Error("工作流至少需要触发器和一个执行节点");
  if (!Array.isArray(graph.edges)) throw new Error("工作流连线格式无效");

  const byId = new Map<string, WorkflowGraphNode>();
  for (const node of graph.nodes) {
    if (!node.id.trim() || byId.has(node.id)) throw new Error("工作流节点 ID 为空或重复");
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new Error("工作流节点位置无效");
    byId.set(node.id, node);
  }
  const triggers = graph.nodes.filter((node) => node.type === "trigger");
  if (triggers.length !== 1) throw new Error("工作流必须且只能包含一个触发器");

  const incoming = new Map<string, WorkflowDataEdge[]>();
  const outgoing = new Map<string, WorkflowDataEdge[]>();
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge.id.trim() || edgeIds.has(edge.id)) throw new Error("工作流连线 ID 为空或重复");
    edgeIds.add(edge.id);
    if (!byId.has(edge.sourceNodeId) || !byId.has(edge.targetNodeId)) throw new Error("工作流连线引用了不存在的节点");
    if (edge.sourceNodeId === edge.targetNodeId) throw new Error("工作流节点不能连接自身");
    outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge]);
    incoming.set(edge.targetNodeId, [...(incoming.get(edge.targetNodeId) ?? []), edge]);
  }
  for (const node of graph.nodes) {
    const inCount = incoming.get(node.id)?.length ?? 0;
    const outCount = outgoing.get(node.id)?.length ?? 0;
    if (node.type === "trigger" && inCount !== 0) throw new Error("触发器不能有输入连线");
    if (node.type !== "trigger" && inCount !== 1) throw new Error(`节点“${node.label}”必须且只能有一条输入连线`);
    if (outCount > 1) throw new Error("第一版工作流暂不支持条件或并行分支");
  }

  const orderedNodes: WorkflowGraphNode[] = [];
  const visited = new Set<string>();
  let current: WorkflowGraphNode | undefined = triggers[0];
  while (current) {
    if (visited.has(current.id)) throw new Error("工作流不能包含循环");
    visited.add(current.id);
    orderedNodes.push(current);
    const nextEdge = outgoing.get(current.id)?.[0];
    current = nextEdge ? byId.get(nextEdge.targetNodeId) : undefined;
  }
  if (visited.size !== graph.nodes.length) throw new Error("工作流包含未连接或无法从触发器到达的节点");
  return { orderedNodes };
}
