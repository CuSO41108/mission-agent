import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "@/pages/Dashboard";
import Folders from "@/pages/Folders";
import FolderDetail from "@/pages/FolderDetail";
import Integrations from "@/pages/Integrations";
import Workflow from "@/pages/Workflow";
import Agents from "@/pages/Agents";
import { useMissionStore } from "@/store/useMissionStore";

export default function App() {
  // 应用启动时从 SQLite 拉取初始数据（Phase 3：folder/integration/workflow）
  // copilot/notification/agentActivity 仍用 mock，留到后续 Phase 接入
  const loadFromDb = useMissionStore((s) => s.loadFromDb);
  useEffect(() => {
    void loadFromDb();
  }, [loadFromDb]);

  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/folders" element={<Folders />} />
          <Route path="/folders/:id" element={<FolderDetail />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/workflow" element={<Workflow />} />
          <Route path="/agents" element={<Agents />} />
        </Route>
      </Routes>
    </Router>
  );
}
