import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { tasksApi } from "../lib/api";
import { socket } from "../lib/socket";
import { useAppStore, type Task } from "../store/useAppStore";
import { ActivityFeed } from "../components/ActivityFeed";
import { PageHeader } from "../components/PageHeader";

export default function TaskWorkspace() {
  const [objective, setObjective] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { tasks, setTasks, addTask, updateTask, activeTaskId, setActiveTask } = useAppStore();

  const active = tasks.find((t) => t.id === activeTaskId) || null;

  useEffect(() => {
    tasksApi.list().then(({ data }) => setTasks(data)).catch(() => {});
  }, [setTasks]);

  // The backend runs the task in the background; refresh whichever task the
  // socket reports on so status/output stay in sync.
  useEffect(() => {
    const onEvent = (e: { task_id?: number; type?: string }) => {
      if (!e.task_id) return;
      if (e.type === "task_completed" || e.type === "approval_required") {
        tasksApi.get(e.task_id).then(({ data }) => updateTask(data.id, data)).catch(() => {});
      }
    };
    socket.on("agent_event", onEvent);
    return () => {
      socket.off("agent_event", onEvent);
    };
  }, [updateTask]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!objective.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const { data } = await tasksApi.create({
        objective,
        requires_approval: requiresApproval,
      });
      addTask(data as Task);
      setActiveTask(data.id);
      setObjective("");
    } catch {
      setError("Could not submit task. Check that you are signed in.");
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (approved: boolean) => {
    if (!active) return;
    const { data } = await tasksApi.approve(active.id, approved);
    updateTask(active.id, data);
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <PageHeader
          title="Task Workspace"
          subtitle="Hand the workforce an objective and watch the agents run"
          accent={[251, 191, 36]}
        />
        <form onSubmit={submit} className="glass rounded-xl p-5 space-y-3">
          <h2 className="text-lg font-semibold">Give the AI workforce an objective</h2>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="e.g. Write a market research report on AI agent startups"
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400 flex items-center gap-2">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
              />
              Pause for my approval after planning
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg btn-primary text-sm font-semibold"
            >
              {submitting ? "Dispatching..." : "Run"}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </form>

        {active && (
          <div className="glass rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold truncate">{active.title}</h3>
              <span className="text-xs text-indigo-300">{active.status}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${active.progress}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500 bg-[length:200%_100%] animate-[gradient-shift_2s_linear_infinite]"
              />
            </div>

            {active.status === "running" && !active.output && (
              <div className="space-y-2 pt-1">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="h-3 rounded shimmer" style={{ width: `${90 - n * 18}%` }} />
                ))}
              </div>
            )}

            {active.status === "awaiting_approval" && (
              <div className="flex gap-2">
                <button onClick={() => approve(true)} className="px-3 py-1.5 text-xs rounded bg-emerald-600">
                  Approve plan
                </button>
                <button onClick={() => approve(false)} className="px-3 py-1.5 text-xs rounded bg-slate-700">
                  Reject
                </button>
              </div>
            )}

            {active.output && (
              <div className="prose prose-invert prose-sm max-w-none max-h-[50vh] overflow-auto">
                <ReactMarkdown>{active.output}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Recent tasks</h3>
          {tasks.length === 0 && <p className="text-sm text-slate-500">No tasks yet.</p>}
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => {
                    setActiveTask(t.id);
                    tasksApi.get(t.id).then(({ data }) => updateTask(t.id, data));
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5 ${
                    t.id === activeTaskId ? "bg-indigo-500/10 text-indigo-300" : "text-slate-300"
                  }`}
                >
                  <span className="truncate block">{t.title}</span>
                  <span className="text-xs text-slate-500">
                    {t.status} · {t.progress}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ActivityFeed limit={40} />
    </div>
  );
}
