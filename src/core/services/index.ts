// Service 层统一出口
export {
  getFolderDetail,
  getAllFoldersWithDetails,
} from "./folderService";
export { getAllIntegrations, getIntegrationById } from "./integrationService";
export { getAllWorkflows, getWorkflowById } from "./workflowService";

// Phase 5：写操作
export {
  setFolderStatus,
  toggleTodo,
  addMaterial,
  toggleAgent,
  toggleWorkflow,
  recordWorkflowRun,
} from "./mutationService";
