import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { knowledgeApi } from "../lib/api";
import { GraphCanvas } from "../components/GraphCanvas";
import { PageHeader } from "../components/PageHeader";
import { Reveal } from "../components/Reveal";

type Node = { id: number; label: string; node_type: string; content?: string | null };
type Edge = { id: number; source_node_id: number; target_node_id: number; relationship: string };

export default function KnowledgeGraph() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ content: string }[]>([]);

  useEffect(() => {
    knowledgeApi
      .graph()
      .then(({ data }) => {
        setNodes(data.nodes);
        setEdges(data.edges);
      })
      .catch(() => {});
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    const { data } = await knowledgeApi.search(q);
    setResults(data.results);
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Knowledge Graph"
        subtitle={`${nodes.length} nodes · ${edges.length} relationships · drag any node`}
        accent={[52, 211, 153]}
      />

      <div className="glass rounded-xl p-2 overflow-hidden">
        <GraphCanvas nodes={nodes} edges={edges} />
      </div>

      <form onSubmit={search} className="glass rounded-xl p-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Semantic search across your knowledge..."
          className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button className="px-4 py-2 rounded-lg btn-primary text-sm font-semibold">Search</button>
      </form>

      {results.length > 0 && (
        <div className="glass rounded-xl p-4 space-y-2">
          {results.map((r, i) => (
            <Reveal key={i} i={i}>
              <p className="text-sm text-slate-300 line-clamp-3">{r.content}</p>
            </Reveal>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Nodes ({nodes.length})</h3>
          <ul className="space-y-1 max-h-[60vh] overflow-auto">
            {nodes.map((n, i) => (
              <motion.li
                key={n.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 20) * 0.02 }}
                className="text-sm text-slate-300 truncate hover:text-indigo-300 transition-colors"
              >
                <span className="text-xs font-mono text-indigo-400 mr-2">{n.node_type}</span>
                {n.label}
              </motion.li>
            ))}
            {nodes.length === 0 && <p className="text-sm text-slate-500">Run a task to build the graph.</p>}
          </ul>
        </div>

        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Relationships ({edges.length})</h3>
          <ul className="space-y-1 max-h-[60vh] overflow-auto">
            {edges.map((e) => (
              <li key={e.id} className="text-xs text-slate-400 truncate font-mono">
                {byId.get(e.source_node_id)?.label ?? e.source_node_id} —{e.relationship}→{" "}
                {byId.get(e.target_node_id)?.label ?? e.target_node_id}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
