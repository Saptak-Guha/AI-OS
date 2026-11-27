import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { ActivityFeed } from "../components/ActivityFeed";
import { PageHeader } from "../components/PageHeader";
import { WhatsAppPanel } from "../components/WhatsAppPanel";
import { analyticsApi, tasksApi } from "../lib/api";
import { useAppStore } from "../store/useAppStore";

type Stats = {
  total_tasks: number;
  active_tasks: number;
  memory_nodes: number;
  knowledge_nodes: number;
  avg_completion_rate: number;
  total_agents: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { tasks, setTasks } = useAppStore();

  useEffect(() => {
    analyticsApi.dashboard().then(({ data }) => setStats(data)).catch(() => {});
    tasksApi.list().then(({ data }) => setTasks(data)).catch(() => {});
  }, [setTasks]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AetherOS"
        subtitle="Your autonomous workforce, at a glance"
        action={
          <Link
            to="/workspace"
            className="px-4 py-2 rounded-lg btn-primary text-sm font-semibold"
          >
            New task
          </Link>
        }
      />

      <div className="grid md:grid-cols-4 gap-4">
        <Card
          i={0}
          icon="◈"
          title="Autonomous Runs"
          value={stats?.total_tasks ?? 0}
          subtitle={`${stats?.active_tasks ?? 0} active`}
        />
        <Card i={1} icon="⬡" title="Memory Nodes" value={stats?.memory_nodes ?? 0} />
        <Card i={2} icon="◉" title="Active Agents" value={stats?.total_agents ?? 0} />
        <Card
          i={3}
          icon="▲"
          title="Completion Rate"
          value={`${stats?.avg_completion_rate ?? 0}%`}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Recent tasks</h3>
          {tasks.length === 0 && (
            <p className="text-sm text-slate-500">
              No tasks yet —{" "}
              <Link to="/workspace" className="text-indigo-400">
                give the workforce an objective
              </Link>
              .
            </p>
          )}
          {tasks.slice(0, 8).map((t) => (
            <div key={t.id} className="flex justify-between text-sm py-1">
              <span className="truncate text-slate-300">{t.title}</span>
              <span className="text-xs text-slate-500 shrink-0 ml-3">{t.status}</span>
            </div>
          ))}
        </div>
        <ActivityFeed />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <WhatsAppPanel />
      </div>
    </div>
  );
}
