import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Ambient } from "./Ambient";
import { CommandPalette } from "./CommandPalette";
import { AgentToasts } from "./AgentToasts";
import { Flourishes } from "./Flourishes";
import { useAuthStore } from "../store/useAuthStore";
import { socket } from "../lib/socket";
import { useAppStore } from "../store/useAppStore";

export function Layout() {
  const { token, fetchUser } = useAuthStore();
  const location = useLocation();
  const addAgentEvent = useAppStore((s) => s.addAgentEvent);

  useEffect(() => {
    if (token) fetchUser();
  }, [token, fetchUser]);

  useEffect(() => {
    socket.on("agent_event", (event) => {
      addAgentEvent({ ...event, ts: Date.now() });
    });
    return () => {
      socket.off("agent_event");
    };
  }, [addAgentEvent]);

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="p-4 flex gap-4 min-h-screen">
      <Ambient />
      <CommandPalette />
      <AgentToasts />
      <Flourishes />
      <Sidebar />
      <main className="flex-1 min-w-0">
        {/* Keyed on the path so React tears the old one down and mounts a
            fresh element per navigation — that remount is what replays the
            CSS animation. */}
        <span key={`sweep-${location.pathname}`} className="route-sweep" aria-hidden />
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 14, scale: 0.985, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, scale: 0.99, filter: "blur(4px)" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
