import path from "node:path";
import { closeDatabase, initDatabase } from "../src/core/db/client";
import { loadConfig } from "../src/core/config";
import { getFolderDetail } from "../src/core/services/folderService";
import {
  createTodo,
  toggleAgent,
  updateAgentConfig,
} from "../src/core/services/mutationService";
import { runFolderAgent } from "../src/core/workflow/WorkflowService";

const [folderId, ...taskParts] = process.argv.slice(2);
const taskTitle = taskParts.join(" ").trim();
if (!folderId) throw new Error("用法：run-agent-once <folderId> [待办标题]");

const appData = process.env.APPDATA;
if (!appData) throw new Error("APPDATA 环境变量不存在");
const userDataDirectory = path.join(appData, "Mission Console");
const dbPath = path.join(userDataDirectory, "mission.db");
const configPath = path.join(userDataDirectory, "config.yaml");

initDatabase({ dbPath });
try {
  let folder = getFolderDetail(folderId);
  if (!folder) throw new Error(`任务舱不存在：${folderId}`);
  if (folder.status !== "active") throw new Error(`任务舱不是 active：${folder.status}`);

  const openAgentTodo = folder.todos.find((todo) => !todo.done && todo.assignee === "agent");
  if (!openAgentTodo) {
    if (!taskTitle) throw new Error("没有未完成的 Agent 待办，请提供待办标题");
    folder = createTodo(folderId, {
      title: taskTitle,
      dueDate: null,
      assignee: "agent",
      source: "manual-agent-test",
    });
  }

  updateAgentConfig(folderId, {
    strategy: "custom",
    permissions: { read: true, write: true },
  });
  toggleAgent(folderId, true);

  const config = loadConfig(configPath);
  if (!config.deepseek.apiKey) throw new Error("DeepSeek API key 未配置");
  const result = await runFolderAgent(folderId, config.deepseek, {
    requestTimeoutMs: 60_000,
  });
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        action: result.action,
        summary: result.summary,
        artifactPath: result.artifactPath,
        todoId: result.todoId,
        usage: result.usage,
        error: result.error,
      },
      null,
      2,
    ),
  );
  if (!result.ok) process.exitCode = 1;
} finally {
  closeDatabase();
}
