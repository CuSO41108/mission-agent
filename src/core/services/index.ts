// Service 层统一出口
export {
  getFolderDetail,
  getAllFoldersWithDetails,
} from "./folderService";
export {
  createIntegration,
  deleteIntegration,
  getAllIntegrations,
  getIntegrationById,
  updateIntegration,
} from "./integrationService";
export { getAllWorkflows, getWorkflowById } from "./workflowService";

// Phase 5：写操作
export {
  createFolder,
  createTodo,
  deleteFolder,
  setFolderStatus,
  toggleTodo,
  addMaterial,
  deleteMaterial,
  toggleAgent,
  updateAgentConfig,
  toggleWorkflow,
  recordWorkflowRun,
} from "./mutationService";
