import type { AgentConfig, TaskFolder } from "../../renderer/types";

export type AgentRunDenialCode =
  | "FOLDER_NOT_FOUND"
  | "FOLDER_INACTIVE"
  | "AGENT_DISABLED";

export interface AgentRunDenial {
  code: AgentRunDenialCode;
  message: string;
}

export function isHeartbeatEligible(
  folder: Pick<TaskFolder, "status">,
  agentConfig: Pick<AgentConfig, "enabled"> | null,
): boolean {
  return folder.status === "active" && agentConfig?.enabled === true;
}

export function getManualRunDenial(
  folder: Pick<TaskFolder, "status"> | null,
  agentConfig: Pick<AgentConfig, "enabled"> | null,
): AgentRunDenial | null {
  if (!folder) {
    return { code: "FOLDER_NOT_FOUND", message: "任务舱不存在" };
  }
  if (folder.status !== "active") {
    return {
      code: "FOLDER_INACTIVE",
      message: `任务舱状态为 ${folder.status}，仅 active 状态可运行 Agent`,
    };
  }
  if (!agentConfig?.enabled) {
    return { code: "AGENT_DISABLED", message: "该任务舱的 Agent 已暂停" };
  }
  return null;
}
