import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Full-screen listening visual: dot grid, a wireframe orb, and a waveform
 * driven by the real microphone signal (Web Audio AnalyserNode).
 * Everything is one canvas — no chart or animation library.
 */
type VoiceState = "listening" | "thinking" | "speaking" | "acting";

const CAPTION: Record<string, Record<VoiceState, string>> = {
  en: { listening: "Listening", thinking: "Thinking", speaking: "Speaking", acting: "Acting" },
  hi: { listening: "सुन रही हूँ", thinking: "सोच रही हूँ", speaking: "बोल रही हूँ", acting: "कर रही हूँ" },
  bn: { listening: "শুনছি", thinking: "ভাবছি", speaking: "বলছি", acting: "করছি" },
};

const PROMPT: Record<string, string> = {
  en: "Say something — take your time",
  hi: "कहिए — जल्दी नहीं है",
  bn: "বলুন — তাড়াহুড়ো নেই",
};

export function VoiceOverlay({
  transcript,
  reply,
  state,
  action,
  settling,
  lang = "en",
  onCancel,
}: {
  transcript: string;
  reply?: string;
  state: VoiceState;
  /** Label of the desktop action in flight, e.g. "Opening YouTube". */
  action?: string;
  /** True during the pause after you stop talking, before she acts. */
  settling?: boolean;
  lang?: "en" | "hi" | "bn";
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // The draw loop reads this without re-subscribing — no restart per state change.
  const stateRef = useRef<VoiceState>(state);
  stateRef.current = state;

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let stream: MediaStream | null = null;
    let audio: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let wave = new Uint8Array(1024); // silence until the mic is granted

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // The overlay stays fully animated if the mic is denied — it just goes flat.
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        stream = s;
        audio = new AudioContext();
        analyser = audio.createAnalyser();
        analyser.fftSize = 2048;
        wave = new Uint8Array(analyser.frequencyBinCount);
        audio.createMediaStreamSource(s).connect(analyser);
      })
      .catch(() => {});

    // Orb points: fibonacci sphere, projected each frame.
    const N = 420;
    const points = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * Math.PI * (3 - Math.sqrt(5));
      return [Math.cos(theta) * r, y, Math.sin(theta) * r] as const;
    });

    let t = 0;
    const draw = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      t += 0.006;
      if (analyser) analyser.getByteTimeDomainData(wave);

      // Loudness drives the orb's pulse and the wave's height.
      let sum = 0;
      for (let i = 0; i < wave.length; i++) sum += Math.abs(wave[i] - 128);
      let level = Math.min(1, sum / wave.length / 40);

      const st = stateRef.current;
      // While she speaks the mic is quiet, so synthesise a speech-like
      // envelope; while thinking, keep it low and steady.
      if (st === "speaking") {
        level = 0.35 + 0.3 * Math.abs(Math.sin(t * 9)) + 0.15 * Math.sin(t * 23);
      } else if (st === "thinking") {
        level = 0.12 + 0.05 * Math.sin(t * 4);
      } else if (st === "acting") {
        // Hard, machine-like pulse — this is her touching the actual system.
        level = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(t * 14)), 3);
      }
      const hue =
        st === "speaking"
          ? { r: 129, g: 140, b: 248 } // indigo — her voice
          : st === "thinking"
            ? { r: 148, g: 163, b: 184 } // slate — working
            : st === "acting"
              ? { r: 251, g: 191, b: 36 } // amber — hands on the machine
              : { r: 34, g: 211, b: 238 }; // cyan — your turn

      ctx.clearRect(0, 0, w, h);

      const cx0 = w / 2;
      const cy0 = h / 2;

      // --- starfield ---
      // Parallax depth behind everything. Deterministic from the index, so
      // stars don't reshuffle every frame the way Math.random() would.
      for (let i = 0; i < 130; i++) {
        const depth = (i % 3) + 1;
        const sx = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
        const sy = ((Math.sin(i * 78.233) * 43758.5453) % 1 + 1) % 1;
        const x = (sx * w + t * 6 * depth) % w;
        const y = sy * h;
        const twinkle = 0.25 + 0.35 * Math.sin(t * 3 + i);
        ctx.fillStyle = `rgba(${hue.r},${hue.g},${hue.b},${twinkle / depth})`;
        ctx.fillRect(x, y, 1.4 / depth + 0.4, 1.4 / depth + 0.4);
      }

      // --- nebula ---
      // Breathes with the voice: louder input, wider and brighter bloom.
      const bloom = Math.min(w, h) * (0.34 + level * 0.16);
      const neb = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, bloom);
      neb.addColorStop(0, `rgba(${hue.r},${hue.g},${hue.b},${0.1 + level * 0.12})`);
      neb.addColorStop(0.55, `rgba(${hue.r},${hue.g},${hue.b},0.04)`);
      neb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, w, h);

      // --- halo rings ---
      // Three rings expanding out of the orb on a stagger, fading as they go.
      for (let k = 0; k < 3; k++) {
        const phase = ((t * 0.32 + k / 3) % 1);
        const radius = Math.min(w, h) * (0.2 + phase * 0.3);
        ctx.strokeStyle = `rgba(${hue.r},${hue.g},${hue.b},${(1 - phase) * 0.22})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx0, cy0, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // --- dot grid ---
      const gap = 26;
      for (let x = 0; x < w; x += gap) {
        for (let y = 0; y < h; y += gap) {
          const d = Math.hypot(x - w / 2, y - h / 2);
          const a = 0.06 + 0.05 * Math.sin(t * 2 - d / 90);
          ctx.fillStyle = `rgba(${hue.r},${hue.g},${hue.b},${Math.max(0, a)})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }

      // --- wireframe orb ---
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.22 * (1 + level * 0.18);
      const projected: [number, number, number][] = [];
      for (const [px, py, pz] of points) {
        const x1 = px * Math.cos(t) - pz * Math.sin(t);
        const z1 = px * Math.sin(t) + pz * Math.cos(t);
        const depth = (z1 + 1) / 2; // 0 back .. 1 front
        projected.push([cx + x1 * radius, cy + py * radius, depth]);
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < projected.length; i++) {
        const [x1, y1, d1] = projected[i];
        // Link to a few neighbours — enough for a mesh, cheap enough for 60fps.
        for (let k = 1; k <= 2; k++) {
          const [x2, y2, d2] = projected[(i + k * 7) % projected.length];
          if (Math.hypot(x2 - x1, y2 - y1) > radius * 0.42) continue;
          ctx.strokeStyle = `rgba(${hue.r},${hue.g},${hue.b},${0.06 + ((d1 + d2) / 2) * 0.22})`;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${hue.r + 60},${hue.g + 30},${hue.b},${0.15 + d1 * 0.7})`;
        ctx.fillRect(x1 - 1, y1 - 1, 2 + d1, 2 + d1);
      }

      // --- mirrored waveform ---
      const baseY = h * 0.8;
      const step = Math.max(1, Math.floor(wave.length / w));
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const v = (wave[(x * step) % wave.length] - 128) / 128;
        // Idle ripple so a quiet mic (or a denied one) still looks alive
        // rather than a dead flat line.
        const idle =
          Math.sin(x * 0.012 + t * 6) * 0.18 +
          Math.sin(x * 0.031 - t * 9) * 0.09;
        const amp = v + idle * (1 - Math.min(1, level * 3));
        const y = baseY + amp * h * 0.16 * (0.35 + level);
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, `rgba(${hue.r},${hue.g},${hue.b},0.15)`);
      grad.addColorStop(0.5, `rgba(${hue.r + 60},${hue.g + 30},${hue.b},0.95)`);
      grad.addColorStop(1, `rgba(${hue.r},${hue.g},${hue.b},0.15)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 18;
      ctx.shadowColor = `rgba(${hue.r},${hue.g},${hue.b},0.8)`;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // reflection
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.translate(0, baseY * 2);
      ctx.scale(1, -1);
      ctx.stroke();
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      stream?.getTracks().forEach((tr) => tr.stop());
      audio?.close();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-[#04121f]/95 backdrop-blur-sm cursor-pointer"
    >
      <canvas ref={canvas} className="absolute inset-0 w-full h-full" />

      <div className="absolute inset-x-0 top-10 text-center pointer-events-none">
        <motion.p
          key={state}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          // Devanagari and Bengali join their letters — wide tracking pulls the
          // conjuncts apart and turns "सुन रही हूँ" into "सु न र ही हूँ".
          className={`text-xs ${lang === "en" ? "tracking-[0.35em] uppercase" : "tracking-normal"} ${
            state === "speaking"
              ? "text-indigo-300"
              : state === "thinking"
                ? "text-slate-400"
                : state === "acting"
                  ? "text-amber-300"
                  : "text-cyan-300"
          }`}
        >
          {(CAPTION[lang] || CAPTION.en)[state]}
        </motion.p>
      </div>

      {/* The patience tell: a bar that fills through the pause after you stop
          talking. If you start again it resets — she has not decided yet. */}
      <AnimatePresence>
        {settling && state === "listening" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 top-[4.5rem] flex justify-center pointer-events-none"
          >
            <div className="h-[2px] w-40 rounded-full bg-cyan-400/15 overflow-hidden">
              <motion.div
                key={transcript}
                className="h-full bg-cyan-300/70"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.9, ease: "linear" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* What she is doing to the machine right now. */}
      <AnimatePresence>
        {action && (
          <motion.div
            key={action}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-x-0 top-24 flex justify-center pointer-events-none"
          >
            <div className="flex items-center gap-3 rounded-full border border-amber-400/40 bg-amber-400/10 px-5 py-2">
              <motion.span
                className="w-2 h-2 rounded-full bg-amber-300"
                animate={{ opacity: [1, 0.2, 1], scale: [1, 1.6, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
              <span className="text-sm text-amber-100 tracking-wide">{action}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 bottom-20 text-center px-10 pointer-events-none">
        {/* Her words while she talks, yours while you do. */}
        <motion.p
          key={state === "speaking" ? "reply" : "transcript"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-2xl font-light min-h-[3rem] max-w-4xl mx-auto ${
            state === "speaking" ? "text-indigo-100" : "text-cyan-100"
          }`}
        >
          {state === "speaking"
            ? (reply || "").slice(-260)
            : transcript || (state === "thinking" ? "…" : PROMPT[lang] || PROMPT.en)}
        </motion.p>
        <p className="text-xs text-slate-400/50 mt-6 tracking-[0.3em] uppercase">
          Click anywhere to end the conversation
        </p>
      </div>
    </motion.div>
  );
}
