import type { AgentActivity, TaskFolder, TimelineEntry, Todo } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function flattenTodos(todos: Todo[]): Todo[] {
  const flattened: Todo[] = [];
  const visit = (items: Todo[]) => {
    for (const todo of items) {
      flattened.push(todo);
      visit(todo.subtasks);
    }
  };
  visit(todos);
  return flattened;
}

export function countTodos(todos: Todo[]): { total: number; done: number } {
  const flattened = flattenTodos(todos);
  return {
    total: flattened.length,
    done: flattened.filter((todo) => todo.done).length,
  };
}

export function isAgentOnline(folder: TaskFolder): boolean {
  return folder.status === "active" && folder.agentConfig.enabled;
}

export function isVisibleFolder(folder: TaskFolder): boolean {
  return folder.status !== "archived";
}

function activityType(entry: TimelineEntry): AgentActivity["type"] {
  if (typeof entry.meta?.errorCode === "string") return "warn";
  const action = entry.action.toLowerCase();
  if (action.includes("失败") || action.includes("异常") || action.includes("error")) return "warn";
  if (action.includes("提醒") || action.includes("通知") || action.includes("notify")) return "notify";
  if (action.includes("生成") || action.includes("创建") || action.includes("添加")) return "create";
  if (action.includes("心跳") || action.includes("巡检") || action.includes("同步")) return "sync";
  return "update";
}

export function buildAgentActivities(folders: TaskFolder[]): AgentActivity[] {
  return folders
    .filter(isVisibleFolder)
    .flatMap((folder) =>
      folder.timeline
        .filter((entry) => entry.actor === "agent" || typeof entry.meta?.errorCode === "string")
        .map((entry) => ({
          id: entry.id,
          folderId: folder.id,
          folderName: folder.name,
          action: entry.action,
          type: activityType(entry),
          timestamp: entry.timestamp,
        })),
    )
    .sort((left, right) => right.timestamp - left.timestamp);
}

export function activitiesInLast24Hours(activities: AgentActivity[], now = Date.now()): AgentActivity[] {
  const cutoff = now - DAY_MS;
  return activities.filter((activity) => activity.timestamp >= cutoff && activity.timestamp <= now);
}
