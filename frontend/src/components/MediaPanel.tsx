import { motion } from "framer-motion";

/**
 * In-app video. She resolves a phrase to a video id on the server, so playing
 * something never steals the screen or the conversation — the overlay stays
 * up and she keeps listening over the top of it.
 */
export function MediaPanel({
  embed,
  title,
  onClose,
}: {
  embed: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="glass rounded-2xl overflow-hidden border border-indigo-500/25"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Three bars bouncing — the room's "something is playing" tell. */}
          <span className="flex items-end gap-[2px] h-4">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-[3px] bg-indigo-400 rounded-full"
                animate={{ height: ["30%", "100%", "45%", "80%", "30%"] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                style={{ height: "30%" }}
              />
            ))}
          </span>
          <p className="text-sm text-slate-200 truncate">{title}</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-red-400 px-2 text-lg leading-none"
          title="Stop"
        >
          ×
        </button>
      </div>

      <div className="relative w-full aspect-video bg-black">
        <iframe
          src={embed}
          title={title}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </motion.div>
  );
}
