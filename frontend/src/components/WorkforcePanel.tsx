import { AnimatePresence, motion } from "framer-motion";

export type WorkStep = { agent: string; message: string; progress?: number };

/**
 * The workforce working, live. This is the screen's whole promise: you said
 * what you wanted once, and the agents are doing it while you watch.
 */
export function WorkforcePanel({
  objective,
  steps,
  progress,
  done,
}: {
  objective: string;
  steps: WorkStep[];
  progress: number;
  done: boolean;
}) {
  // Only the last few — a long task would otherwise push the chat off screen.
  const visible = steps.slice(-4);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: "spring", stiffness: 240, damping: 26 }}
      className="glass rounded-2xl border border-indigo-500/25 overflow-hidden"
    >
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5 mb-2.5">
          <motion.span
            className={`w-2 h-2 rounded-full ${done ? "bg-emerald-400" : "bg-indigo-400"}`}
            animate={done ? {} : { scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-300/80">
            {done ? "Delivered" : "Workforce running"}
          </p>
          <span className="ml-auto text-xs font-mono text-slate-500">{progress}%</span>
        </div>

        <p className="text-sm text-slate-300 mb-3 line-clamp-2">{objective}</p>

        <div className="h-1 rounded-full bg-slate-700/50 overflow-hidden">
          <motion.div
            className="h-full progress-bar"
            animate={{ width: `${progress}%` }}
            transition={{ ease: "easeOut", duration: 0.5 }}
          />
        </div>
      </div>

      <div className="px-4 pb-3.5 space-y-1.5">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((step, i) => (
            <motion.div
              key={`${step.agent}-${steps.length - visible.length + i}`}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: i === visible.length - 1 ? 1 : 0.45, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex items-baseline gap-2.5 text-xs"
            >
              <span className="font-mono text-indigo-300 shrink-0 w-20 truncate">
                {step.agent}
              </span>
              <span className="text-slate-400 truncate">{step.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
