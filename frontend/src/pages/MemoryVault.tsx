import { useEffect, useState } from "react";
import { memoryApi } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Reveal } from "../components/Reveal";

type MemoryItem = {
  id: number | string;
  content: string;
  memory_type?: string;
  type?: string;
  agent_name?: string | null;
  tags?: string[] | string;
  created_at?: string | null;
};

export default function MemoryVault() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [content, setContent] = useState("");
  const [q, setQ] = useState("");

  const load = () => memoryApi.list().then(({ data }) => setItems(data)).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    await memoryApi.create({ content });
    setContent("");
    load();
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return load();
    const { data } = await memoryApi.search(q);
    setItems(data);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Memory Vault"
        subtitle={`${items.length} memories — everything she recalls about you`}
        accent={[244, 114, 182]}
      />

      <form onSubmit={add} className="glass rounded-xl p-4 flex gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Remember something about you or your work..."
          className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button className="px-4 py-2 rounded-lg btn-primary text-sm font-semibold">Save</button>
      </form>

      <form onSubmit={search} className="glass rounded-xl p-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Recall..."
          className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button className="px-4 py-2 rounded-lg bg-slate-700 text-sm font-semibold">Recall</button>
      </form>

      <div className="glass rounded-xl p-4 space-y-3">
        {items.length === 0 && <p className="text-sm text-slate-500">No memories stored yet.</p>}
        {items.map((m, idx) => (
          <Reveal key={m.id} i={idx} className="border-b border-slate-800 pb-2 last:border-0">
            <div className="flex gap-2 text-xs text-slate-500">
              <span className="font-mono text-indigo-400">{m.memory_type || m.type}</span>
              {m.agent_name && <span>{m.agent_name}</span>}
              {m.created_at && <span>{new Date(m.created_at).toLocaleString()}</span>}
              {typeof m.id === "number" && (
                <button
                  onClick={() => memoryApi.remove(m.id as number).then(load)}
                  className="ml-auto hover:text-red-400"
                >
                  Forget
                </button>
              )}
            </div>
            <p className="text-sm text-slate-300 mt-1">{m.content}</p>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
