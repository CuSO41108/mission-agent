import type { WorkflowRule } from "../../renderer/types";

/** 返回仍引用指定模型配置的工作流名称；同一工作流只报告一次。 */
export function findWorkflowModelProfileReferences(
  workflows: Array<Pick<WorkflowRule, "name" | "actions" | "graph">>,
  profileId: string,
): string[] {
  return workflows.flatMap((workflow) => {
    const legacyReference = workflow.actions.some((action) =>
      action.type === "agent" && action.config.agent?.modelProfileId === profileId);
    const graphReference = workflow.graph?.nodes.some((node) =>
      node.type === "agent" && node.config.agent?.modelProfileId === profileId) ?? false;
    return legacyReference || graphReference ? [workflow.name] : [];
  });
}
