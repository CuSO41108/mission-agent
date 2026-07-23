import { useEffect } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "@/pages/Dashboard";
import Folders from "@/pages/Folders";
import FolderDetail from "@/pages/FolderDetail";
import Integrations from "@/pages/Integrations";
import Workflow from "@/pages/Workflow";
import Agents from "@/pages/Agents";
import Settings from "@/pages/Settings";
import { useMissionStore } from "@/store/useMissionStore";
import { PreferencesProvider } from "@/i18n";

export default function App() {
  // 应用启动时从 SQLite 拉取初始数据（Phase 3：folder/integration/workflow）
  // copilot/notification/agentActivity 仍用 mock，留到后续 Phase 接入
  const loadFromDb = useMissionStore((s) => s.loadFromDb);
  const refreshFolders = useMissionStore((s) => s.refreshFolders);
  const refreshWorkflows = useMissionStore((s) => s.refreshWorkflows);
  const pushNotification = useMissionStore((s) => s.pushNotification);
  useEffect(() => {
    void loadFromDb();
  }, [loadFromDb]);

  useEffect(() => {
    const unsubscribeAgent = window.missionConsole.onAgentEvent((payload) => {
      if (!payload || typeof payload !== "object") return;
      const event = payload as {
        type?: string;
        folderId?: string;
        title?: string;
        body?: string;
        error?: string;
        results?: Array<{ folderId?: string }>;
      };
      const ids = event.folderId
        ? [event.folderId]
        : event.results?.flatMap((result) => result.folderId ? [result.folderId] : []) ?? [];
      if (ids.length) void refreshFolders(ids);
      if (event.type === "agent_notification" && event.title) {
        pushNotification({ type: "info", title: event.title, body: event.body, folderId: event.folderId, source: "agent" });
      }
      if ((event.type === "agent_error" || event.type === "heartbeat_error") && event.error) {
        pushNotification({ type: "error", title: "Agent 执行失败", body: event.error, folderId: event.folderId, source: "agent" });
      }
    });
    const unsubscribeWorkflow = window.missionConsole.onWorkflowEvent((payload) => {
      if (!payload || typeof payload !== "object") return;
      const event = payload as { type?: string; folderIds?: string[]; folderId?: string | null; title?: string; body?: string };
      void refreshWorkflows();
      if (event.folderIds?.length) void refreshFolders(event.folderIds);
      if (event.type === "notification" && event.title) {
        pushNotification({ type: "info", title: event.title, body: event.body, folderId: event.folderId ?? undefined, source: "system" });
      }
    });
    return () => {
      unsubscribeAgent();
      unsubscribeWorkflow();
    };
  }, [pushNotification, refreshFolders, refreshWorkflows]);

  return (
    <PreferencesProvider>
      <Router>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/folders" element={<Folders />} />
            <Route path="/folders/:id" element={<FolderDetail />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/workflow" element={<Workflow />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </PreferencesProvider>
  );
}
