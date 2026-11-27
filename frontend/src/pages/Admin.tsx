import { useEffect, useState } from "react";
import api from "../lib/api";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { Reveal } from "../components/Reveal";

type Overview = { total_users: number; total_tasks: number; total_agent_logs: number };
type AdminUser = { id: number; email: string; full_name: string; role: string };

export default function Admin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api
      .get("/admin/overview")
      .then(({ data }) => setOverview(data))
      .catch(() => setDenied(true));
    api
      .get("/admin/users")
      .then(({ data }) => setUsers(data))
      .catch(() => {});
  }, []);

  if (denied) {
    return (
      <div className="glass rounded-xl p-6">
        <p className="text-slate-400 text-sm">
          Admin access required. Set your user's <code className="text-indigo-300">role</code> to{" "}
          <code className="text-indigo-300">admin</code> in the database.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Admin Console" subtitle="Platform-wide usage" accent={[251, 191, 36]} />

      <div className="grid md:grid-cols-3 gap-4">
        <Card i={0} title="Users" value={overview?.total_users ?? 0} />
        <Card i={1} title="Tasks" value={overview?.total_tasks ?? 0} />
        <Card i={2} title="Agent Logs" value={overview?.total_agent_logs ?? 0} />
      </div>

      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-400 mb-3">Users</h3>
        {users.map((u, i) => (
          <Reveal key={u.id} i={i}>
            <div className="flex justify-between text-sm py-1 rounded px-2 -mx-2 hover:bg-white/5 transition-colors">
              <span className="text-slate-300">{u.full_name}</span>
              <span className="text-slate-500">
                {u.email} · {u.role}
              </span>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
