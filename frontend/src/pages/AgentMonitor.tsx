import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { agentsApi } from "../lib/api";
import { ActivityFeed } from "../components/ActivityFeed";
import { Reveal } from "../components/Reveal";
import { PageHeader } from "../components/PageHeader";

type AgentInfo = {
  name: string;
  role: string;
  goal: string;
  tools: string[];
  specialization: string;
  performance_score: number;
};

export default function AgentMonitor() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    agentsApi.list().then(({ data }) => setAgents(data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agent Monitor"
        subtitle={`${agents.length} specialists standing by`}
        accent={[167, 139, 250]}
      />
      <div className="grid md:grid-cols-3 gap-4">
        {agents.map((a, i) => (
          <Reveal key={a.name} i={i}>
            <div className="glass rounded-xl p-4 glass-hover h-full relative overflow-hidden">
              {/* idle heartbeat — the agent is loaded and waiting */}
              <motion.span
                className="absolute -right-6 -top-6 w-16 h-16 rounded-full bg-violet-500/10"
                animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0.15, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, delay: i * 0.2 }}
              />
              <div className="flex items-center justify-between relative">
                <p className="font-semibold text-sm">{a.role}</p>
                <span className="text-xs text-slate-500 font-mono">{a.specialization}</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">{a.goal}</p>
              {a.tools?.length > 0 && (
                <p className="text-xs text-slate-600 font-mono mt-2">{a.tools.join(", ")}</p>
              )}
            </div>
          </Reveal>
        ))}
      </div>
      <ActivityFeed limit={50} />
    </div>
  );
}
