import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { NeuralField } from "./NeuralField";

/** Animated banner shared by every page, so the platform reads as one product. */
export function PageHeader({
  title,
  subtitle,
  action,
  accent = [34, 211, 238],
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  accent?: [number, number, number];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="glass rounded-xl relative overflow-hidden"
    >
      <NeuralField density={38} accent={accent} />
      {/* The field is drawn inside the header, so its lines pass directly
          behind the title at full brightness. Darken the left third where the
          text sits and let the field stay legible on the right, rather than
          dimming the whole animation to make one corner readable. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(13,20,38,0.92) 0%, rgba(13,20,38,0.75) 32%, rgba(13,20,38,0) 62%)",
        }}
      />
      <div className="relative flex items-center justify-between gap-4 px-6 py-5">
        <div>
          <motion.h2
            key={title}
            initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
            animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="text-xl font-bold gradient-text"
          >
            {title}
          </motion.h2>
          {subtitle && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.25 }}
              className="text-xs text-slate-400 mt-1"
            >
              {subtitle}
            </motion.p>
          )}
        </div>
        {action}
      </div>
    </motion.div>
  );
}
