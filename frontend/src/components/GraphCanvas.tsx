import { useEffect, useRef } from "react";

export type GraphNode = { id: number; label: string; node_type: string };
export type GraphEdge = { source_node_id: number; target_node_id: number; relationship: string };

const TYPE_COLORS: Record<string, string> = {
  concept: "#818cf8",
  entity: "#22d3ee",
  document: "#34d399",
  task: "#fbbf24",
  memory: "#f472b6",
};

/**
 * Force-directed knowledge graph on a canvas: repulsion between nodes,
 * springs along edges, drag to reposition. ponytail: O(n²) repulsion, fine
 * to a few hundred nodes — swap in a quadtree if the graph ever gets bigger.
 */
export function GraphCanvas({
  nodes,
  edges,
  height = 460,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const w = () => cv.clientWidth;
    const h = () => cv.clientHeight;

    const sim = nodes.map((n, i) => ({
      ...n,
      x: w() / 2 + Math.cos((i / Math.max(1, nodes.length)) * Math.PI * 2) * 140 + Math.random() * 20,
      y: h() / 2 + Math.sin((i / Math.max(1, nodes.length)) * Math.PI * 2) * 140 + Math.random() * 20,
      vx: 0,
      vy: 0,
    }));
    const index = new Map(sim.map((n) => [n.id, n]));
    const links = edges
      .map((e) => ({ a: index.get(e.source_node_id), b: index.get(e.target_node_id), rel: e.relationship }))
      .filter((l) => l.a && l.b) as { a: (typeof sim)[0]; b: (typeof sim)[0]; rel: string }[];

    let dragging: (typeof sim)[0] | null = null;
    let hover: (typeof sim)[0] | null = null;
    const at = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const pick = (p: { x: number; y: number }) =>
      sim.find((n) => Math.hypot(n.x - p.x, n.y - p.y) < 14) || null;

    const onDown = (e: MouseEvent) => (dragging = pick(at(e)));
    const onMove = (e: MouseEvent) => {
      const p = at(e);
      hover = pick(p);
      cv.style.cursor = hover ? "grab" : "default";
      if (dragging) {
        dragging.x = p.x;
        dragging.y = p.y;
        dragging.vx = dragging.vy = 0;
      }
    };
    const onUp = () => (dragging = null);
    cv.addEventListener("mousedown", onDown);
    cv.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    let t = 0;
    const step = () => {
      t += 0.01;
      const cx = w() / 2;
      const cy = h() / 2;

      for (let i = 0; i < sim.length; i++) {
        const a = sim[i];
        if (a === dragging) continue;
        // pull to centre so nothing escapes the panel
        a.vx += (cx - a.x) * 0.0009;
        a.vy += (cy - a.y) * 0.0009;

        for (let j = 0; j < sim.length; j++) {
          if (i === j) continue;
          const b = sim[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 1;
          if (d2 > 40000) continue;
          const f = 900 / d2;
          a.vx += (dx / Math.sqrt(d2)) * f * 0.05;
          a.vy += (dy / Math.sqrt(d2)) * f * 0.05;
        }
      }

      for (const l of links) {
        const dx = l.b.x - l.a.x;
        const dy = l.b.y - l.a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const f = (dist - 110) * 0.002;
        if (l.a !== dragging) {
          l.a.vx += (dx / dist) * f;
          l.a.vy += (dy / dist) * f;
        }
        if (l.b !== dragging) {
          l.b.vx -= (dx / dist) * f;
          l.b.vy -= (dy / dist) * f;
        }
      }

      for (const n of sim) {
        if (n === dragging) continue;
        n.vx *= 0.86;
        n.vy *= 0.86;
        n.x = Math.max(16, Math.min(w() - 16, n.x + n.vx));
        n.y = Math.max(16, Math.min(h() - 16, n.y + n.vy));
      }

      ctx.clearRect(0, 0, w(), h());

      for (const l of links) {
        const lit = hover && (l.a === hover || l.b === hover);
        ctx.strokeStyle = lit ? "rgba(56,189,248,0.75)" : "rgba(99,102,241,0.22)";
        ctx.lineWidth = lit ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(l.a.x, l.a.y);
        ctx.lineTo(l.b.x, l.b.y);
        ctx.stroke();

        // pulse travelling along the edge — the graph looks alive
        const p = (t * 0.6 + (l.a.x + l.b.x) * 0.001) % 1;
        ctx.fillStyle = "rgba(103,232,249,0.7)";
        ctx.beginPath();
        ctx.arc(l.a.x + (l.b.x - l.a.x) * p, l.a.y + (l.b.y - l.a.y) * p, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const n of sim) {
        const c = TYPE_COLORS[n.node_type] || "#94a3b8";
        const lit = n === hover;
        const r = lit ? 9 : 6;
        ctx.shadowBlur = lit ? 18 : 8;
        ctx.shadowColor = c;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (lit || sim.length <= 24) {
          ctx.fillStyle = "rgba(226,232,240,0.9)";
          ctx.font = "11px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(n.label.slice(0, 26), n.x, n.y - r - 6);
        }
      }

      raf = requestAnimationFrame(step);
    };
    step();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mouseup", onUp);
      cv.removeEventListener("mousedown", onDown);
      cv.removeEventListener("mousemove", onMove);
    };
  }, [nodes, edges]);

  return (
    <div className="relative" style={{ height }}>
      <canvas ref={ref} className="w-full h-full" />
      {nodes.length === 0 && (
        <p className="absolute inset-0 grid place-items-center text-sm text-slate-500">
          Run a task to build the knowledge graph.
        </p>
      )}
    </div>
  );
}
