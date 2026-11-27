import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../store/useAppStore";

const AGENT_COLORS: Record<string, string> = {
  manager: "text-purple-400",
  planner: "text-blue-400",
  research: "text-cyan-400",
  writer: "text-green-400",
  reviewer: "text-yellow-400",
  qa: "text-orange-400",
  memory: "text-pink-400",
  tool: "text-indigo-400",
  delivery: "text-emerald-400",
  strategy: "text-amber-400",
  architect: "text-violet-400",
};

export function ActivityFeed({ limit = 20 }: { limit?: number }) {
  const events = useAppStore((s) => s.agentEvents).slice(0, limit);

  if (events.length === 0) {
    return (
      <div className="glass rounded-xl p-6 text-center text-slate-500">
        <p>Agent activity will appear here in real time</p>
        <p className="text-xs mt-1">Submit a task to activate the AI workforce</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-2 max-h-[400px] overflow-auto">
      <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Live Agent Activity
      </h3>
      <AnimatePresence>
        {events.map((e, i) => (
          <motion.div
            key={`${e.ts}-${i}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, height: 0 }}
            layout
            className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5"
          >
            <div className={`w-2 h-2 rounded-full mt-2 ${e.agent ? "bg-indigo-400 agent-pulse" : "bg-slate-600"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {e.agent && (
                  <span className={`text-xs font-mono font-medium ${AGENT_COLORS[e.agent] || "text-slate-400"}`}>
                    {e.agent}
                  </span>
                )}
                <span className="text-xs text-slate-600">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                {e.progress !== undefined && e.progress > 0 && (
                  <span className="text-xs text-indigo-400">{e.progress}%</span>
                )}
              </div>
              <p className="text-sm text-slate-300 truncate">{e.message}</p>
              {e.tool_used && (
                <span className="text-xs text-slate-500 font-mono">tool: {e.tool_used}</span>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
