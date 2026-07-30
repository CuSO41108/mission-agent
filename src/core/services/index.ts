// Service 层统一出口
export {
  getFolderDetail,
  getAllFoldersWithDetails,
} from "./folderService";
export {
  getMaterialAvailability,
  inspectMaterialAvailability,
  listMissingMaterials,
} from "./materialAvailability";
export {
  createIntegration,
  deleteIntegration,
  getAllIntegrations,
  getIntegrationById,
  getIntegrationSecrets,
  migrateLegacyIntegrationSecrets,
  setIntegrationStatus,
  updateIntegration,
} from "./integrationService";
export { configureIntegrationSecretStore } from "./integrationSecretStore";
export {
  createWorkflow,
  deleteWorkflow,
  getAllWorkflows,
  getWorkflowById,
  getWorkflowRuns,
  updateWorkflow,
} from "./workflowService";

// Phase 5：写操作
export {
  createFolder,
  createTodo,
  updateTodo,
  deleteFolder,
  setFolderStatus,
  toggleTodo,
  updateTodoAssignment,
  addMaterial,
  updateNoteMaterial,
  renameNoteMaterial,
  deleteMaterial,
  toggleAgent,
  updateAgentConfig,
  toggleWorkflow,
  recordWorkflowRun,
} from "./mutationService";
