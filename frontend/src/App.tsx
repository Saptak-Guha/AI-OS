import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import CommandCenter from "./pages/CommandCenter";
import TaskWorkspace from "./pages/TaskWorkspace";
import AgentMonitor from "./pages/AgentMonitor";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import MemoryVault from "./pages/MemoryVault";
import Documents from "./pages/Documents";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chat" element={<CommandCenter />} />
          <Route path="/workspace" element={<TaskWorkspace />} />
          <Route path="/agent-monitor" element={<AgentMonitor />} />
          <Route path="/knowledge-graph" element={<KnowledgeGraph />} />
          <Route path="/memory-vault" element={<MemoryVault />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
