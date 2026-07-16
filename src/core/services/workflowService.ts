// Workflow Service · 工作流业务层

import { WorkflowRepository } from "../repositories/workflowRepository";
import type { WorkflowRule } from "../../renderer/types";

export function getAllWorkflows(): WorkflowRule[] {
  return WorkflowRepository.list();
}

export function getWorkflowById(id: string): WorkflowRule | null {
  return WorkflowRepository.findById(id);
}
