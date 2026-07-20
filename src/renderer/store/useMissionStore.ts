import { create } from "zustand";
import type {
  TaskFolder,
  IntegrationAdapter,
  WorkflowRule,
  AgentActivity,
  CopilotMessage,
  Todo,
  Material,
  AgentNotification,
  CreateFolderInput,
  CreateTodoInput,
  UpdateAgentConfigInput,
  UpsertIntegrationInput,
} from "@/types";
// Phase 3：folder/integration/workflow 改为从 SQLite 拉取
// 以下 mock 仍保留：agentActivity / copilot / notification 留到后续 Phase 接入
import {
  mockAgentActivities,
  mockCopilotMessages,
  mockNotifications,
} from "@/data/mock";

interface MissionState {
  folders: TaskFolder[];
  integrations: IntegrationAdapter[];
  workflows: WorkflowRule[];
  agentActivities: AgentActivity[];
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
  createFolder: (input: CreateFolderInput) => Promise<TaskFolder>;
  deleteFolder: (folderId: string) => Promise<boolean>;
  createTodo: (folderId: string, input: CreateTodoInput) => Promise<TaskFolder>;
  toggleTodo: (folderId: string, todoId: string) => Promise<void>;
  toggleAgent: (folderId: string) => void;
  updateAgentConfig: (folderId: string, input: UpdateAgentConfigInput) => Promise<TaskFolder>;
  runAgentOnce: (folderId: string) => Promise<{ ok: boolean; summary?: string; error?: string }>;
  setFolderStatus: (folderId: string, status: TaskFolder["status"]) => void;
  toggleWorkflow: (id: string) => void;
  createIntegration: (input: UpsertIntegrationInput) => Promise<IntegrationAdapter>;
  updateIntegration: (id: string, input: UpsertIntegrationInput) => Promise<IntegrationAdapter>;
  deleteIntegration: (id: string) => Promise<boolean>;
  sendCopilot: (content: string) => void;
  pushCopilot: (content: string) => void;
  setCopilotOpen: (open: boolean) => void;
  runCopilotAction: (messageId: string, actionId: string) => void;
  addMaterial: (folderId: string, m: Omit<Material, "id" | "addedAt" | "folderId">) => Promise<Material>;
  deleteMaterial: (folderId: string, materialId: string) => Promise<boolean>;
  pushNotification: (n: Omit<AgentNotification, "id" | "timestamp" | "read">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setNotificationPanelOpen: (open: boolean) => void;
}

const genId = () => Math.random().toString(36).slice(2, 9);

// ============ Mock 流式数据生成 ============
// 未来接入 DeepSeek 时，只需把这里的 generator 换成真实 API 流即可
// UI 层消费 chunk 的逻辑完全一致

interface AgentReplyPlan {
  fullText: string;
  references?: import("@/types").CopilotReference[];
  actions?: import("@/types").CopilotAction[];
  thinking?: import("@/types").CopilotThinking;
}

function planAgentReply(userText: string): AgentReplyPlan {
  const t = userText.toLowerCase();

  if (t.includes("催办") || t.includes("催")) {
    return {
      thinking: {
        summary: "扫描到 2 项临近截止任务",
        steps: [
          "读取所有 enabled 舱体的 deadline 字段",
          "比对当前时间，筛选 ≤24h 未完成的任务",
          "命中：Q3 财务复盘（剩余 6h）、新品发布物料（剩余 1d）",
          "生成催办待办，准备推送到时间线",
        ],
      },
      fullText:
        "指挥中心已就绪。今日检测到 2 项紧急截止，需要我启动 Agent 催办吗？建议先处理高优先级项，再批量同步至飞书群。",
      references: [
        { kind: "folder", id: "f-001", label: "Q3 财务复盘", meta: "剩余 6h" },
        { kind: "folder", id: "f-002", label: "新品发布物料", meta: "剩余 1d" },
      ],
      actions: [
        { id: "a1", label: "启动 Agent 催办", variant: "primary", command: "催办今日截止的紧急任务" },
        { id: "a2", label: "查看详情", variant: "ghost", command: "今日进度" },
      ],
    };
  }

  if (t.includes("新建") || t.includes("创建") || t.includes("建舱")) {
    return {
      thinking: {
        summary: "解析用户描述，生成舱体结构草稿",
        steps: [
          "从指令中抽取关键词：下周、客户演示",
          "根据模板生成 3 个待办：准备方案大纲、Demo 演示流、客户问题清单",
          "预填 1 条材料占位（待上传方案文档）",
          "等待用户确认后入舱",
        ],
      },
      fullText:
        "已根据描述生成草稿舱体「客户演示准备」，预填 3 个待办与 1 条材料占位。请确认后我会正式入舱并接入邮件接口。",
      references: [
        { kind: "folder", id: "draft", label: "客户演示准备", meta: "草稿" },
      ],
      actions: [
        { id: "a1", label: "确认入舱", variant: "primary", command: "确认入舱" },
        { id: "a2", label: "修改名称", variant: "ghost", command: "修改舱体名称" },
      ],
    };
  }

  if (t.includes("进度") || t.includes("状态")) {
    return {
      thinking: {
        summary: "聚合所有舱体的 progress 字段",
        steps: [
          "读取 folders 表全部记录",
          "计算全局完成率 = sum(progress) / count",
          "按 deadline 排序找出最紧迫的两项",
        ],
      },
      fullText:
        "当前 6 个活跃舱体，全局完成率 47%。最需关注：Q3 财务复盘（剩余 6h，进度 62%）、新品发布物料（剩余 3d，进度 38%）。",
      references: [
        { kind: "folder", id: "f-001", label: "Q3 财务复盘", meta: "进度 62%" },
        { kind: "folder", id: "f-002", label: "新品发布物料", meta: "进度 38%" },
      ],
      actions: [
        { id: "a1", label: "立即催办", variant: "primary", command: "催办紧急任务" },
      ],
    };
  }

  if (t.includes("邮件") || t.includes("mail")) {
    return {
      thinking: {
        summary: "调用 Gmail 接口拉取今日邮件",
        steps: [
          "通过 imapflow 连接 Gmail",
          "按时间倒序拉取最近 24h 邮件",
          "应用规则匹配：含「deadline」「会议」「确认」关键词",
          "命中 3 条，写入对应舱体的 materials 表",
        ],
      },
      fullText:
        "Gmail 已同步，今日新增 24 条邮件，其中 3 条匹配「待办」规则已自动入舱。需要我展示这 3 条的摘要吗？",
      references: [
        { kind: "integration", id: "i-gmail", label: "Gmail", meta: "今日 +24" },
      ],
      actions: [
        { id: "a1", label: "查看摘要", variant: "primary", command: "展示邮件摘要" },
        { id: "a2", label: "归档至舱", variant: "ghost", command: "归档邮件" },
      ],
    };
  }

  return {
    fullText: `已记录指令：「${userText}」。我会在对应舱体的时间线中留痕，并在下一次心跳（30min）时执行。如需立即执行，点击下方按钮。`,
    actions: [
      { id: "a1", label: "立即执行", variant: "primary", command: "立即执行" },
    ],
  };
}

// 模拟流式 chunk 生成器（未来换成 deepseekStream 即可）
async function* mockStream(plan: AgentReplyPlan): AsyncGenerator<{
  type: "chunk" | "done";
  chunk?: string;
  meta?: import("@/types").CopilotMeta;
}> {
  // 模拟先思考，再逐字输出
  await new Promise((r) => setTimeout(r, 200));
  const chunks = plan.fullText.match(/[^。！？，、；]+[。！？，、；]?/g) || [plan.fullText];
  for (const c of chunks) {
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
    yield { type: "chunk", chunk: c };
  }
  yield {
    type: "done",
    meta: {
      model: "deepseek-chat",
      tokensIn: 128,
      tokensOut: plan.fullText.length,
      durationMs: chunks.length * 60 + 200,
    },
  };
}

export const useMissionStore = create<MissionState>((set, get) => ({
  // Phase 3：初始为空，由 loadFromDb() 从 SQLite 拉取
  folders: [],
  integrations: [],
  workflows: [],
  // 以下仍用 mock，留到后续 Phase 接入 SQLite
  agentActivities: mockAgentActivities,
  copilotMessages: mockCopilotMessages,
  copilotOpen: false,
  copilotStreaming: false,
  notifications: mockNotifications,
  commandPaletteOpen: false,
  notificationPanelOpen: false,
  loaded: false,
  loading: false,
  loadError: null,

  // ============ 从 SQLite 加载数据（Phase 3） ============
  loadFromDb: async () => {
    if (get().loading || get().loaded) return;
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

  // ============ 写操作（Phase 5：调 IPC + 本地刷新） ============
  // 设计：写 IPC 落库后，本地 store 乐观更新 + 拿返回值刷新
  // 失败时回滚（此处简化为 console.error，未来可加 toast）

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

  toggleAgent: (folderId) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    const newEnabled = !folder.agentConfig.enabled;

    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === folderId
          ? { ...f, agentConfig: { ...f.agentConfig, enabled: newEnabled } }
          : f
      ),
    }));

    void window.missionConsole
      .toggleAgent(folderId, newEnabled)
      .catch((err) => console.error("[store] toggleAgent IPC 失败：", err));
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

  setFolderStatus: (folderId, status) => {
    // 乐观更新
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === folderId
          ? {
              ...f,
              status,
              progress: status === "done" ? 100 : f.progress,
              timeline: [
                {
                  id: genId(),
                  folderId,
                  actor: "human" as const,
                  action: `状态变更为 ${status}`,
                  timestamp: Date.now(),
                },
                ...f.timeline,
              ],
            }
          : f
      ),
    }));

    void window.missionConsole
      .setFolderStatus(folderId, status)
      .catch((err) => console.error("[store] setFolderStatus IPC 失败：", err));
  },

  toggleWorkflow: (id) => {
    const wf = get().workflows.find((w) => w.id === id);
    if (!wf) return;
    const newEnabled = !wf.enabled;

    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, enabled: newEnabled } : w
      ),
    }));

    void window.missionConsole
      .toggleWorkflow(id, newEnabled)
      .catch((err) => console.error("[store] toggleWorkflow IPC 失败：", err));
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

  sendCopilot: (content) => {
    const userMsg: CopilotMessage = {
      id: genId(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    const agentMsgId = genId();
    const plan = planAgentReply(content);
    const agentMsg: CopilotMessage = {
      id: agentMsgId,
      role: "agent",
      content: "",
      timestamp: Date.now() + 1,
      streaming: true,
      thinking: plan.thinking,
      references: plan.references,
      // actions 在流式完成后才显示
    };

    set((s) => ({
      copilotMessages: [...s.copilotMessages, userMsg, agentMsg],
      copilotStreaming: true,
    }));

    // 异步消费流
    (async () => {
      const stream = mockStream(plan);
      for await (const item of stream) {
        if (item.type === "chunk" && item.chunk) {
          set((s) => ({
            copilotMessages: s.copilotMessages.map((m) =>
              m.id === agentMsgId
                ? { ...m, content: m.content + item.chunk }
                : m
            ),
          }));
        } else if (item.type === "done") {
          set((s) => ({
            copilotMessages: s.copilotMessages.map((m) =>
              m.id === agentMsgId
                ? {
                    ...m,
                    streaming: false,
                    actions: plan.actions,
                    meta: item.meta,
                  }
                : m
            ),
            copilotStreaming: false,
          }));
        }
      }
    })();
  },

  pushCopilot: (content) =>
    set((s) => ({
      copilotMessages: [
        ...s.copilotMessages,
        { id: genId(), role: "agent", content, timestamp: Date.now() },
      ],
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
