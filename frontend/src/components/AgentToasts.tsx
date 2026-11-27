import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore, type AgentEvent } from "../store/useAppStore";

/** Agent activity, visible from every page.
 *
 *  The ActivityFeed only exists on the Dashboard, so a workflow running while
 *  you're reading a document happened silently. These are the same socket
 *  events, surfaced wherever you are and gone again in a few seconds.
 *
 *  Reads the store rather than opening a second socket listener: Layout
 *  already owns the subscription, and two listeners would double every event. */
const LIFETIME = 4500;
const MAX = 3;

export function AgentToasts() {
  const events = useAppStore((s) => s.agentEvents);
  const [shown, setShown] = useState<AgentEvent[]>([]);
  // Events arrive newest-first; remember the newest we've already raised so a
  // re-render never replays the backlog.
  const seen = useRef<number>(0);

  useEffect(() => {
    const latest = events[0];
    if (!latest || latest.ts <= seen.current) return;
    seen.current = latest.ts;
    if (!latest.message) return;

    setShown((s) => [latest, ...s].slice(0, MAX));
    const t = setTimeout(
      () => setShown((s) => s.filter((e) => e.ts !== latest.ts)),
      LIFETIME,
    );
    return () => clearTimeout(t);
  }, [events]);

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col-reverse gap-2 pointer-events-none">
      <AnimatePresence>
        {shown.map((e) => (
          <motion.div
            key={e.ts}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="glass live-edge rounded-lg px-4 py-3 w-72 shadow-glow"
          >
            <p className="text-xs uppercase tracking-wider text-indigo-300">
              {e.agent || "agent"}
            </p>
            <p className="text-sm text-slate-200 mt-0.5 line-clamp-2">{e.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
