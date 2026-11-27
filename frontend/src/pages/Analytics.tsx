import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { analyticsApi } from "../lib/api";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";

type Stats = {
  total_tasks: number;
  completed_tasks: number;
  active_tasks: number;
  total_agents: number;
  memory_nodes: number;
  avg_completion_rate: number;
  knowledge_nodes: number;
  documents_processed: number;
};

type Perf = {
  agent_name: string;
  tasks_completed: number;
  avg_duration_ms: number;
  tools_used: number;
};

export default function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [perf, setPerf] = useState<Perf[]>([]);

  useEffect(() => {
    analyticsApi.dashboard().then(({ data }) => setStats(data)).catch(() => {});
    analyticsApi.agents().then(({ data }) => setPerf(data)).catch(() => {});
  }, []);

  const busiest = Math.max(1, ...perf.map((p) => p.tasks_completed));

  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" subtitle="Workforce throughput and agent performance" />

      <div className="grid md:grid-cols-4 gap-4">
        <Card i={0} title="Total Tasks" value={stats?.total_tasks ?? 0} />
        <Card i={1} title="Completed" value={stats?.completed_tasks ?? 0} />
        <Card i={2} title="Completion Rate" value={`${stats?.avg_completion_rate ?? 0}%`} />
        <Card i={3} title="Documents" value={stats?.documents_processed ?? 0} />
      </div>

      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-400 mb-3">Agent performance</h3>
        {perf.length === 0 && <p className="text-sm text-slate-500">No completed agent runs yet.</p>}
        <div className="space-y-3">
          {perf.map((p, i) => (
            <div key={p.agent_name}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-mono text-indigo-300">{p.agent_name}</span>
                <span className="text-xs text-slate-400">
                  {p.tasks_completed} runs · {Math.round(p.avg_duration_ms)}ms avg · {p.tools_used} tools
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(p.tasks_completed / busiest) * 100}%` }}
                  transition={{ delay: i * 0.07, duration: 0.7, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
