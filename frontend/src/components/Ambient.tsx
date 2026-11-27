import { useEffect, useRef } from "react";

/**
 * The site's living background: a slow constellation drifting behind every
 * page, with the whole field leaning gently toward the cursor.
 *
 * Two rules it must never break, because a background that fights the text is
 * worse than no background:
 *   - `pointer-events: none` and a negative z-index — it can never take a
 *     click or land on top of content.
 *   - It draws dim. The readability scrim in index.css sits between this and
 *     the page, so contrast holds no matter what drifts underneath.
 */
export function Ambient() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    // Honour the OS setting: no motion means a still field, not a jittery one.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const mouse = { x: -9999, y: -9999 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap: 4K DPR is wasted here
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    // Density scales with the viewport so a laptop isn't as busy as a monitor.
    const area = window.innerWidth * window.innerHeight;
    const COUNT = Math.min(90, Math.round(area / 22000));
    const dots = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.16,
      vy: (Math.random() - 0.5) * 0.16,
      r: Math.random() * 1.5 + 0.5,
      hue: Math.random(),
    }));

    const LINK = 150;

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (const d of dots) {
        if (!still) {
          d.x += d.vx;
          d.y += d.vy;
          // Cursor gravity — subtle enough to feel alive, not to be a toy.
          const dx = mouse.x - d.x;
          const dy = mouse.y - d.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 220 && dist > 1) {
            d.x += (dx / dist) * 0.22;
            d.y += (dy / dist) * 0.22;
          }
          // Wrap rather than bounce: bouncing makes the edges look like walls.
          if (d.x < -20) d.x = w + 20;
          if (d.x > w + 20) d.x = -20;
          if (d.y < -20) d.y = h + 20;
          if (d.y > h + 20) d.y = -20;
        }
      }

      // Links first, so the dots sit on top of their own threads.
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i];
          const b = dots[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > LINK) continue;
          const strength = 1 - dist / LINK;
          ctx.strokeStyle = `rgba(99, 102, 241, ${strength * 0.26})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const d of dots) {
        const near = Math.hypot(mouse.x - d.x, mouse.y - d.y) < 220;
        const c = d.hue > 0.6 ? "34, 211, 238" : "129, 140, 248";
        ctx.fillStyle = `rgba(${c}, ${near ? 0.75 : 0.42})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return <canvas ref={ref} className="ambient-layer" aria-hidden="true" />;
}
