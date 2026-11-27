import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "../store/useAuthStore";
import { healthApi, type LlmHealth } from "../lib/api";

const nav = [
  { label: "Dashboard", path: "/" },
  { label: "Command Center", path: "/chat" },
  { label: "Task Workspace", path: "/workspace" },
  { label: "Agent Monitor", path: "/agent-monitor" },
  { label: "Knowledge Graph", path: "/knowledge-graph" },
  { label: "Memory Vault", path: "/memory-vault" },
  { label: "Document Intelligence", path: "/documents" },
  { label: "Analytics", path: "/analytics" },
  { label: "Settings", path: "/settings" },
  { label: "Admin Console", path: "/admin" },
];

/** Presence light, driven by real provider health rather than a hardcoded dot.
 *  Degraded is amber, not red: answers still arrive, they just come from a
 *  local model that cannot look anything up. */
function status(h: LlmHealth | null) {
  if (!h) return { dot: "bg-slate-600", text: "Connecting…", tone: "text-slate-500" };
  if (h.degraded_from)
    return { dot: "bg-amber-400", text: h.reason || "Degraded", tone: "text-amber-400/90" };
  if (!h.ok) return { dot: "bg-rose-500", text: "No model available", tone: "text-rose-400/90" };
  return { dot: "bg-cyan-400", text: "Standing by", tone: "text-slate-500" };
}

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const [health, setHealth] = useState<LlmHealth | null>(null);

  useEffect(() => {
    // The backend caches the probe for 60s, so polling here is cheap.
    const check = () =>
      healthApi
        .get()
        .then(({ data }) => setHealth(data.llm))
        .catch(() => setHealth(null));
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  const s = status(health);

  return (
    <aside className="glass w-64 rounded-2xl p-5 h-[calc(100vh-2rem)] sticky top-4 flex flex-col shadow-glow">
      <div className="mb-6">
        <h1 className="text-xl font-bold gradient-text">AetherOS</h1>
        <div className="flex items-center gap-2 mt-1.5">
          {/* Presence light — steady when idle, bright while she has the mic
              (body.listening is set by the Command Center). */}
          <motion.span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`}
            animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.35, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <p className={`text-xs leading-snug ${s.tone}`} title={s.text}>
            {s.text}
          </p>
        </div>
      </div>

      {/* Scrolls, so the sign-out footer below stays reachable. The sidebar is
          a fixed 100vh-2rem, and ten nav items plus header and footer overflow
          that at ordinary laptop heights — which silently clipped Sign out. */}
      <nav className="space-y-1 flex-1 overflow-y-auto -mr-2 pr-2">
        {nav.map((item, i) => (
          <motion.div
            key={item.path}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
          >
            <NavLink
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `nav-link relative block rounded-lg px-3 py-2 text-sm ${
                  isActive ? "text-indigo-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    // layoutId makes the highlight glide between items.
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-indigo-500/20 border border-indigo-500/30"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{item.label}</span>
                </>
              )}
            </NavLink>
          </motion.div>
        ))}
      </nav>

      <div className="border-t border-slate-700/50 pt-4 mt-4">
        {user && (
          <div className="text-xs text-slate-500 mb-2 truncate">{user.full_name}</div>
        )}
        <button
          onClick={logout}
          className="text-xs text-slate-500 hover:text-red-400 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
