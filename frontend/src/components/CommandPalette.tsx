import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { documentsApi, memoryApi, tasksApi } from "../lib/api";

/** Same routes the sidebar shows — one list, so a page can't exist in the nav
 *  and be unreachable from the palette. */
const targets = [
  { label: "Dashboard", path: "/", hint: "overview" },
  { label: "Command Center", path: "/chat", hint: "talk to LEO" },
  { label: "Task Workspace", path: "/workspace", hint: "tasks" },
  { label: "Agent Monitor", path: "/agent-monitor", hint: "live agents" },
  { label: "Knowledge Graph", path: "/knowledge-graph", hint: "connections" },
  { label: "Memory Vault", path: "/memory-vault", hint: "recall" },
  { label: "Document Intelligence", path: "/documents", hint: "files" },
  { label: "Analytics", path: "/analytics", hint: "metrics" },
  { label: "Settings", path: "/settings", hint: "preferences" },
  { label: "Admin Console", path: "/admin", hint: "system" },
];

type Hit = { label: string; path: string; hint: string };

/** ⌘K / Ctrl+K jump-to-anywhere — pages, plus your own tasks, memories and
 *  documents. The three lists are fetched once when the palette opens and
 *  filtered in the browser: they are small, and a request per keystroke buys
 *  latency for nothing. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [mine, setMine] = useState<Hit[]>([]);
  const navigate = useNavigate();

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = [...targets, ...mine];
    if (!needle) return targets;
    return all.filter((t) => (t.label + " " + t.hint).toLowerCase().includes(needle));
  }, [q, mine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQ("");
        setSel(0);
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    // One pass per opening. A failed list just means fewer results, never a
    // broken palette — navigation must keep working offline.
    Promise.allSettled([tasksApi.list(), memoryApi.list(), documentsApi.list()]).then(
      ([tasks, memories, docs]) => {
        const out: Hit[] = [];
        if (tasks.status === "fulfilled")
          for (const t of tasks.value.data as { title: string; status: string }[])
            out.push({ label: t.title, path: "/workspace", hint: `task · ${t.status}` });
        if (memories.status === "fulfilled")
          for (const m of memories.value.data as { content: string }[])
            out.push({ label: m.content.slice(0, 70), path: "/memory-vault", hint: "memory" });
        if (docs.status === "fulfilled")
          for (const d of docs.value.data) out.push({ label: d.filename, path: "/documents", hint: "document" });
        setMine(out);
      },
    );
  }, [open]);

  // Clamp after filtering, or Enter fires on an index the list no longer has.
  const active = hits.length ? Math.min(sel, hits.length - 1) : 0;

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const createTask = async () => {
    const objective = q.trim();
    if (!objective) return;
    setOpen(false);
    try {
      await tasksApi.create({ objective });
    } catch {
      // The workspace shows the real error; the palette just gets out of the way.
    }
    navigate("/workspace");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="glass palette-panel live-edge rounded-xl w-full max-w-lg h-fit overflow-hidden"
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSel(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSel((s) => Math.min(s + 1, hits.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSel((s) => Math.max(s - 1, 0));
                } else if (e.key === "Enter") {
                  if (hits[active]) go(hits[active].path);
                  else createTask();
                }
              }}
              placeholder="Jump to, or search tasks, memories and documents…"
              className="w-full bg-transparent px-5 py-4 text-sm border-b border-slate-700/60 focus:outline-none"
            />
            <ul className="max-h-72 overflow-y-auto py-1">
              {hits.map((t, idx) => (
                <motion.li
                  key={t.path + t.label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(idx, 8) * 0.02, duration: 0.16 }}
                >
                  <button
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => go(t.path)}
                    className={`w-full text-left px-5 py-2.5 text-sm flex justify-between items-center ${
                      idx === active ? "bg-indigo-500/15 text-white" : "text-slate-400"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span className="text-xs text-slate-600">{t.hint}</span>
                  </button>
                </motion.li>
              ))}
              {!hits.length && (
                <li>
                  <button
                    onClick={createTask}
                    className="w-full text-left px-5 py-3 text-sm bg-indigo-500/15 text-white flex justify-between items-center"
                  >
                    <span>Give the workforce: “{q}”</span>
                    <span className="text-xs text-slate-500">new task ↵</span>
                  </button>
                </li>
              )}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
