import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { CountUp } from "./CountUp";

/** Indigo → sky → emerald → amber, matching .gradient-text's brand ramp. */
const ACCENTS = ["#818cf8", "#38bdf8", "#34d399", "#fbbf24"];

export function Card({
  title,
  value,
  subtitle,
  icon,
  i = 0,
  accent,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  /** Position in a row — staggers the entrance. */
  i?: number;
  /** Accent for the top rule and the icon wash. Defaults per position so a row
   *  of cards reads as four distinct metrics instead of four identical boxes. */
  accent?: string;
}) {
  const tint = accent ?? ACCENTS[i % ACCENTS.length];

  // Pointer position within the card, -0.5..0.5. Springs so the tilt settles
  // instead of snapping, and so leaving the card glides back to flat.
  const px = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });
  const py = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });
  const rotateX = useTransform(py, [-0.5, 0.5], ["7deg", "-7deg"]);
  const rotateY = useTransform(px, [-0.5, 0.5], ["-7deg", "7deg"]);

  const track = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    px.set(x - 0.5);
    py.set(y - 0.5);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 20 }}
      onMouseMove={track}
      onMouseLeave={() => {
        px.set(0);
        py.set(0);
      }}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className="glass rounded-xl p-5 glass-hover transition-all relative overflow-hidden"
    >
      {/* A hairline of colour at the top edge — enough to tell the cards apart
          at a glance without adding chrome to a number that should dominate. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${tint}, transparent)` }}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider">{title}</p>
          <motion.p
            key={String(value)}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold mt-1 text-white"
          >
            <CountUp value={value} />
          </motion.p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <span
            className="text-lg leading-none rounded-lg px-2.5 py-2 shrink-0"
            style={{ background: `${tint}1f`, boxShadow: `inset 0 0 0 1px ${tint}33` }}
          >
            {icon}
          </span>
        )}
      </div>
    </motion.div>
  );
}
