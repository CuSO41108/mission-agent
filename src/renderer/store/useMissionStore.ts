import { create } from "zustand";
import type {
  TaskFolder,
  IntegrationAdapter,
  WorkflowRule,
  CopilotMessage,
  CopilotMode,
  Todo,
  Material,
  AgentNotification,
  CreateFolderInput,
  CreateTodoInput,
  UpdateAgentConfigInput,
  UpsertIntegrationInput,
  UpsertWorkflowInput,
  WorkflowRun,
} from "@/types";
import { countTodos } from "@/lib/missionStats";

interface MissionState {
  folders: TaskFolder[];
  integrations: IntegrationAdapter[];
  workflows: WorkflowRule[];
  copilotMessages: CopilotMessage[];
  copilotOpen: boolean;
  copilotStreaming: boolean;
  notifications: AgentNotification[];
  commandPaletteOpen: boolean;
  notificationPanelOpen: boolean;
  // Phase 3：数据加载状态
  loaded: boolean;
  loading: boolean;
  loadError: string | null;

  loadFromDb: () => Promise<void>;
  refreshFolders: (folderIds?: string[]) => Promise<void>;
  refreshWorkflows: () => Promise<void>;
  createFolder: (input: CreateFolderInput) => Promise<TaskFolder>;
  deleteFolder: (folderId: string) => Promise<boolean>;
  createTodo: (folderId: string, input: CreateTodoInput) => Promise<TaskFolder>;
  toggleTodo: (folderId: string, todoId: string) => Promise<void>;
  toggleAgent: (folderId: string) => Promise<void>;
  updateAgentConfig: (folderId: string, input: UpdateAgentConfigInput) => Promise<TaskFolder>;
  runAgentOnce: (folderId: string) => Promise<{ ok: boolean; summary?: string; error?: string }>;
  setFolderStatus: (folderId: string, status: TaskFolder["status"]) => Promise<void>;
  toggleWorkflow: (id: string) => Promise<void>;
  createWorkflow: (input: UpsertWorkflowInput) => Promise<WorkflowRule>;
  updateWorkflow: (id: string, input: UpsertWorkflowInput) => Promise<WorkflowRule>;
  deleteWorkflow: (id: string) => Promise<boolean>;
  runWorkflow: (id: string, folderId?: string | null) => Promise<WorkflowRun>;
  createIntegration: (input: UpsertIntegrationInput) => Promise<IntegrationAdapter>;
  updateIntegration: (id: string, input: UpsertIntegrationInput) => Promise<IntegrationAdapter>;
  deleteIntegration: (id: string) => Promise<boolean>;
  sendCopilot: (content: string, mode: CopilotMode) => Promise<void>;
  pushCopilot: (content: string) => void;
  clearCopilot: () => void;
  applyCopilotDraft: (messageId: string) => Promise<void>;
  cancelCopilotDraft: (messageId: string) => void;
  setCopilotOpen: (open: boolean) => void;
  runCopilotAction: (messageId: string, actionId: string) => void;
  addMaterial: (folderId: string, m: Omit<Material, "id" | "addedAt" | "folderId">) => Promise<Material>;
  updateNoteMaterial: (folderId: string, materialId: string, content: string) => Promise<Material>;
  deleteMaterial: (folderId: string, materialId: string) => Promise<boolean>;
  pushNotification: (n: Omit<AgentNotification, "id" | "timestamp" | "read">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setNotificationPanelOpen: (open: boolean) => void;
}

const genId = () => Math.random().toString(36).slice(2, 9);

// Copilot 当前是确定性的本地查询助手，不调用模型或第三方运行时。

interface LocalReplyPlan {
  fullText: string;
  references?: import("@/types").CopilotReference[];
  actions?: import("@/types").CopilotAction[];
  thinking?: import("@/types").CopilotThinking;
}

const newCopilotWelcome = (): CopilotMessage => ({
  id: genId(),
  role: "agent",
  content: "我是本地任务助手，只读取当前客户端中的任务舱、待办和适配器配置。可以查询今日进度、临期任务和接入状态；不会自行发送邮件、飞书消息或调用模型。",
  timestamp: Date.now(),
});

function deadlineLabel(deadline: number | null, now: number): string {
  if (!deadline) return "未设置截止时间";
  const hours = Math.ceil((deadline - now) / 3_600_000);
  if (hours < 0) return `已逾期 ${Math.abs(hours)} 小时`;
  if (hours <= 24) return `剩余 ${hours} 小时`;
  return `剩余 ${Math.ceil(hours / 24)} 天`;
}

function planLocalReply(
  userText: string,
  folders: TaskFolder[],
  integrations: IntegrationAdapter[],
): LocalReplyPlan {
  const query = userText.toLowerCase();
  const visibleFolders = folders.filter((folder) => folder.status !== "archived");
  const activeFolders = visibleFolders.filter((folder) => folder.status === "active");
  const now = Date.now();
  const urgentFolders = activeFolders
    .filter((folder) => folder.deadline !== null && folder.deadline <= now + 24 * 3_600_000)
    .sort((left, right) => (left.deadline ?? Infinity) - (right.deadline ?? Infinity));

  if (["邮件", "mail", "gmail", "飞书", "feishu", "lark", "同步接口"].some((word) => query.includes(word))) {
    return {
      fullText: integrations.length > 0
        ? `当前保存了 ${integrations.length} 个适配器配置，但第三方连接运行时尚未接入，因此没有执行邮件收发、飞书同步或外部消息推送。`
        : "当前没有已注册的适配器，第三方连接运行时也尚未接入，因此没有执行邮件收发、飞书同步或外部消息推送。",
      actions: [{ id: genId(), label: "查看适配器", variant: "ghost", command: "open_integrations" }],
    };
  }

  if (query.includes("催办") || query.includes("紧急") || query.includes("临期") || query.includes("截止")) {
    if (urgentFolders.length === 0) {
      return {
        fullText: "根据当前本地数据，未来 24 小时内没有截止或已经逾期的活跃任务舱。我没有发送任何外部催办消息。",
        actions: [{ id: genId(), label: "查看全部任务舱", variant: "ghost", command: "open_folders" }],
      };
    }
    const listed = urgentFolders.slice(0, 5);
    return {
      thinking: {
        summary: `从本地数据找到 ${urgentFolders.length} 个需跟进任务舱`,
        steps: ["只检查状态为 active 的任务舱", "筛选已逾期或未来 24 小时内截止的记录", "未发送邮件、飞书消息或启动 Agent"],
      },
      fullText: `当前有 ${urgentFolders.length} 个任务舱需要跟进：${listed.map((folder) => `${folder.name}（${deadlineLabel(folder.deadline, now)}，进度 ${folder.progress}%）`).join("；")}。点击下方任务舱可查看详情。`,
      references: listed.map((folder) => ({ kind: "folder", id: folder.id, label: folder.name, meta: deadlineLabel(folder.deadline, now) })),
      actions: [{ id: genId(), label: "查看任务舱列表", variant: "primary", command: "open_folders" }],
    };
  }

  if (query.includes("进度") || query.includes("状态") || query.includes("今日")) {
    const totals = visibleFolders.reduce(
      (sum, folder) => {
        const counts = countTodos(folder.todos);
        return { total: sum.total + counts.total, done: sum.done + counts.done };
      },
      { total: 0, done: 0 },
    );
    const progress = Math.round((totals.done / Math.max(totals.total, 1)) * 100);
    const references = [...activeFolders]
      .sort((left, right) => (left.deadline ?? Infinity) - (right.deadline ?? Infinity))
      .slice(0, 4)
      .map((folder) => ({ kind: "folder" as const, id: folder.id, label: folder.name, meta: `进度 ${folder.progress}%` }));
    return {
      thinking: {
        summary: "统计当前本地任务数据",
        steps: ["排除已归档任务舱", "递归统计所有层级待办", `已完成 ${totals.done}/${totals.total} 项待办`],
      },
      fullText: `当前有 ${activeFolders.length} 个活跃任务舱；所有未归档任务舱共完成 ${totals.done}/${totals.total} 项待办，整体待办进度为 ${progress}%。这是任务完成率，不代表 Agent 正在运行。`,
      references,
      actions: [{ id: genId(), label: "打开概览", variant: "primary", command: "open_dashboard" }],
    };
  }

  if (query.includes("新建") || query.includes("创建") || query.includes("建舱")) {
    return {
      fullText: "本地任务助手不会根据一句话静默创建数据。你可以打开“新建任务舱”表单，确认名称、优先级和截止时间后再保存。",
      actions: [{ id: genId(), label: "新建任务舱", variant: "primary", command: "create_folder" }],
    };
  }

  if (query.includes("任务舱") || query.includes("任务") || query.includes("待办")) {
    const listed = activeFolders.slice(0, 5);
    return {
      fullText: activeFolders.length > 0
        ? `当前有 ${activeFolders.length} 个活跃任务舱。点击引用可以直接进入对应任务舱。`
        : "当前没有活跃任务舱。可以从任务舱库新建一个。",
      references: listed.map((folder) => ({ kind: "folder", id: folder.id, label: folder.name, meta: `进度 ${folder.progress}%` })),
      actions: [{ id: genId(), label: "查看任务舱列表", variant: "primary", command: "open_folders" }],
    };
  }

  return {
    fullText: "这个请求超出了本地任务助手目前的能力。我现在可以查询：今日进度、临期任务、任务舱列表和适配器接入状态；不会在后台替你执行未确认的操作。",
  };
}

export const useMissionStore = create<MissionState>((set, get) => ({
  // Phase 3：初始为空，由 loadFromDb() 从 SQLite 拉取
  folders: [],
  integrations: [],
  workflows: [],
  copilotMessages: [newCopilotWelcome()],
  copilotOpen: false,
  copilotStreaming: false,
  notifications: [],
  commandPaletteOpen: false,
  notificationPanelOpen: false,
  loaded: false,
  loading: false,
  loadError: null,

  // ============ 从 SQLite 加载数据（Phase 3） ============
  loadFromDb: async () => {
    if (get().loading) return;
    set({ loading: true, loadError: null });
    try {
      const [folders, integrations, workflows] = await Promise.all([
        window.missionConsole.getFolders(),
        window.missionConsole.getIntegrations(),
        window.missionConsole.getWorkflows(),
      ]);
      set({
        folders,
        integrations,
        workflows,
        loaded: true,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        loadError: err instanceof Error ? err.message : String(err),
      });
      console.error("[store] loadFromDb 失败：", err);
    }
  },

  refreshFolders: async (folderIds) => {
    if (!folderIds?.length) {
      const folders = await window.missionConsole.getFolders();
      set({ folders });
      return;
    }
    const uniqueIds = [...new Set(folderIds)];
    const refreshed = await Promise.all(uniqueIds.map((id) => window.missionConsole.getFolder(id)));
    const byId = new Map<string, TaskFolder>();
    for (const folder of refreshed) {
      if (folder) byId.set(folder.id, folder);
    }
    const requested = new Set(uniqueIds);
    set((state) => {
      const existingIds = new Set(state.folders.map((folder) => folder.id));
      return {
        folders: [
          ...state.folders
            .filter((folder) => !requested.has(folder.id) || byId.has(folder.id))
            .map((folder) => byId.get(folder.id) ?? folder),
          ...[...byId.values()].filter((folder) => !existingIds.has(folder.id)),
        ],
      };
    });
  },

  refreshWorkflows: async () => {
    const workflows = await window.missionConsole.getWorkflows();
    set({ workflows });
  },

  // ============ 写操作（Phase 5：调 IPC + 本地刷新） ============
  // 设计：写 IPC 成功后使用返回值或重新查询数据库，避免乐观状态与 SQLite 分叉。

  createFolder: async (input) => {
    const folder = await window.missionConsole.createFolder(input);
    set((s) => ({ folders: [folder, ...s.folders] }));
    return folder;
  },

  deleteFolder: async (folderId) => {
    const deleted = await window.missionConsole.deleteFolder(folderId);
    if (deleted) {
      set((s) => ({ folders: s.folders.filter((folder) => folder.id !== folderId) }));
    }
    return deleted;
  },

  createTodo: async (folderId, input) => {
    const folder = await window.missionConsole.createTodo(folderId, input);
    set((state) => ({
      folders: state.folders.map((item) => (item.id === folderId ? folder : item)),
    }));
    return folder;
  },

  toggleTodo: async (folderId, todoId) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    const findTodo = (todos: Todo[]): Todo | undefined => {
      for (const t of todos) {
        if (t.id === todoId) return t;
        const sub = findTodo(t.subtasks);
        if (sub) return sub;
      }
      return undefined;
    };
    const target = findTodo(folder.todos);
    const newDone = target ? !target.done : false;

    const updated = await window.missionConsole.toggleTodo(folderId, todoId, newDone);
    set((state) => ({
      folders: state.folders.map((item) => (item.id === folderId ? updated : item)),
    }));
  },

  toggleAgent: async (folderId) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    const newEnabled = !folder.agentConfig.enabled;

    const updated = await window.missionConsole.toggleAgent(folderId, newEnabled);
    set((state) => ({
      folders: state.folders.map((item) => (item.id === folderId ? updated : item)),
    }));
  },

  updateAgentConfig: async (folderId, input) => {
    const folder = await window.missionConsole.updateAgentConfig(folderId, input);
    set((state) => ({
      folders: state.folders.map((item) => (item.id === folderId ? folder : item)),
    }));
    return folder;
  },

  runAgentOnce: async (folderId) => {
    const result = await window.missionConsole.runAgentOnce(folderId);
    const folder = await window.missionConsole.getFolder(folderId);
    if (folder) {
      set((state) => ({
        folders: state.folders.map((item) => (item.id === folderId ? folder : item)),
      }));
    }
    return result;
  },

  setFolderStatus: async (folderId, status) => {
    const updated = await window.missionConsole.setFolderStatus(folderId, status);
    if (updated) {
      set((state) => ({
        folders: state.folders.map((item) => (item.id === folderId ? updated : item)),
      }));
    }
  },

  toggleWorkflow: async (id) => {
    const wf = get().workflows.find((w) => w.id === id);
    if (!wf) return;
    const newEnabled = !wf.enabled;

    const updated = await window.missionConsole.toggleWorkflow(id, newEnabled);
    set((state) => ({
      workflows: state.workflows.map((item) => (item.id === id ? updated : item)),
    }));
  },

  createWorkflow: async (input) => {
    const workflow = await window.missionConsole.createWorkflow(input);
    await get().refreshWorkflows();
    return workflow;
  },

  updateWorkflow: async (id, input) => {
    const workflow = await window.missionConsole.updateWorkflow(id, input);
    await get().refreshWorkflows();
    return workflow;
  },

  deleteWorkflow: async (id) => {
    const deleted = await window.missionConsole.deleteWorkflow(id);
    if (deleted) await get().refreshWorkflows();
    return deleted;
  },

  runWorkflow: async (id, folderId) => {
    const run = await window.missionConsole.runWorkflow(id, folderId);
    await Promise.all([get().refreshWorkflows(), get().refreshFolders(run.folderId ? [run.folderId] : undefined)]);
    return run;
  },

  createIntegration: async (input) => {
    const integration = await window.missionConsole.createIntegration(input);
    set((state) => ({ integrations: [...state.integrations, integration] }));
    return integration;
  },

  updateIntegration: async (id, input) => {
    const integration = await window.missionConsole.updateIntegration(id, input);
    set((state) => ({
      integrations: state.integrations.map((item) => (item.id === id ? integration : item)),
    }));
    return integration;
  },

  deleteIntegration: async (id) => {
    const deleted = await window.missionConsole.deleteIntegration(id);
    if (deleted) {
      set((state) => ({ integrations: state.integrations.filter((item) => item.id !== id) }));
    }
    return deleted;
  },

  addMaterial: async (folderId, m) => {
    const material = await window.missionConsole.addMaterial(folderId, m);
    const refreshed = await window.missionConsole.getFolder(folderId);
    set((s) => ({
      folders: s.folders.map((folder) =>
        folder.id === folderId
          ? refreshed ?? { ...folder, materials: [material, ...folder.materials] }
          : folder,
      ),
    }));
    return material;
  },

  updateNoteMaterial: async (folderId, materialId, content) => {
    const material = await window.missionConsole.updateNoteMaterial(folderId, materialId, content);
    const refreshed = await window.missionConsole.getFolder(folderId);
    set((state) => ({
      folders: state.folders.map((folder) => folder.id === folderId
        ? refreshed ?? {
            ...folder,
            materials: folder.materials.map((item) => item.id === materialId ? material : item),
          }
        : folder),
    }));
    return material;
  },

  deleteMaterial: async (folderId, materialId) => {
    const deleted = await window.missionConsole.deleteMaterial(folderId, materialId);
    if (deleted) {
      const refreshed = await window.missionConsole.getFolder(folderId);
      set((s) => ({
        folders: s.folders.map((folder) =>
          folder.id === folderId
            ? refreshed ?? {
                ...folder,
                materials: folder.materials.filter((material) => material.id !== materialId),
              }
            : folder,
        ),
      }));
    }
    return deleted;
  },

  sendCopilot: async (content, mode) => {
    const userMsg: CopilotMessage = {
      id: genId(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    if (mode === "local") {
      const plan = planLocalReply(content, get().folders, get().integrations);
      const agentMsg: CopilotMessage = {
        id: genId(),
        role: "agent",
        content: plan.fullText,
        timestamp: Date.now() + 1,
        thinking: plan.thinking,
        references: plan.references,
        actions: plan.actions,
      };
      set((s) => ({ copilotMessages: [...s.copilotMessages, userMsg, agentMsg], copilotStreaming: false }));
      return;
    }

    const agentMsgId = genId();
    const startedAt = Date.now();
    set((s) => ({
      copilotMessages: [...s.copilotMessages, userMsg, {
        id: agentMsgId,
        role: "agent",
        content: "",
        timestamp: Date.now() + 1,
        streaming: true,
      }],
      copilotStreaming: true,
    }));
    try {
      const response = mode === "analysis"
        ? await window.missionConsole.analyzeCopilot(content)
        : await window.missionConsole.draftCopilot(content);
      if (!response.ok) throw new Error(response.error);
      const result = response.result;
      set((state) => ({
        copilotMessages: state.copilotMessages.map((message) => message.id === agentMsgId ? {
          ...message,
          content: result.content,
          streaming: false,
          draft: result.draft,
          draftStatus: result.draft ? "pending" : undefined,
          meta: {
            model: result.model,
            tokensIn: result.usage?.promptTokens ?? 0,
            tokensOut: result.usage?.completionTokens ?? 0,
            durationMs: Date.now() - startedAt,
          },
        } : message),
        copilotStreaming: false,
      }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      set((state) => ({
        copilotMessages: state.copilotMessages.map((message) => message.id === agentMsgId ? {
          ...message,
          content: `智能${mode === "analysis" ? "分析" : "草稿生成"}未完成：${detail}`,
          streaming: false,
        } : message),
        copilotStreaming: false,
      }));
    }
  },

  pushCopilot: (content) =>
    set((s) => ({
      copilotMessages: [
        ...s.copilotMessages,
        { id: genId(), role: "agent", content, timestamp: Date.now() },
      ],
    })),

  clearCopilot: () => set({ copilotMessages: [newCopilotWelcome()], copilotStreaming: false }),

  applyCopilotDraft: async (messageId) => {
    const message = get().copilotMessages.find((item) => item.id === messageId);
    const draft = message?.draft;
    if (!draft || message?.draftStatus !== "pending") return;
    try {
      if (draft.kind === "folder") {
        const folder = await get().createFolder(draft.input);
        for (const todo of draft.todos) {
          await get().createTodo(folder.id, { ...todo, dueDate: null });
        }
      } else {
        await get().createWorkflow(draft.input);
      }
      set((state) => ({
        copilotMessages: state.copilotMessages.map((item) => item.id === messageId ? { ...item, draftStatus: "applied", draftError: undefined } : item),
      }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      set((state) => ({
        copilotMessages: state.copilotMessages.map((item) => item.id === messageId ? { ...item, draftStatus: "failed", draftError: detail } : item),
      }));
      throw error;
    }
  },

  cancelCopilotDraft: (messageId) => set((state) => ({
    copilotMessages: state.copilotMessages.map((item) => item.id === messageId && item.draftStatus === "pending"
      ? { ...item, draftStatus: "cancelled" }
      : item),
  })),

  runCopilotAction: (messageId, actionId) =>
    set((s) => ({
      copilotMessages: s.copilotMessages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              actions: m.actions?.map((a) =>
                a.id === actionId ? { ...a, done: true } : a
              ),
            }
          : m
      ),
    })),

  setCopilotOpen: (open) => set({ copilotOpen: open }),

  pushNotification: (n) =>
    set((s) => ({
      notifications: [
        {
          ...n,
          id: genId(),
          timestamp: Date.now(),
          read: false,
        },
        ...s.notifications,
      ],
    })),

  markNotificationRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markAllNotificationsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setNotificationPanelOpen: (open) => set({ notificationPanelOpen: open }),
}));
