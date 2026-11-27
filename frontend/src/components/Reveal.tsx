import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Fade-and-rise entrance. `i` staggers siblings in a list or grid. */
export function Reveal({
  children,
  i = 0,
  className = "",
}: {
  children: ReactNode;
  i?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: i * 0.03, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
