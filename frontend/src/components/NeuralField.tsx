import { useEffect, useRef } from "react";

type Rgb = [number, number, number];

/**
 * Animated particle constellation — drifting nodes that link when close and
 * lean toward the cursor. Used as a background layer behind page headers.
 * One canvas, no library.
 */
export function NeuralField({
  className = "",
  density = 46,
  color = [99, 102, 241] as Rgb,
  accent = [34, 211, 238] as Rgb,
}: {
  className?: string;
  density?: number;
  color?: Rgb;
  accent?: Rgb;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const mouse = { x: -999, y: -999 };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = mouse.y = -999;
    };
    cv.parentElement?.addEventListener("mousemove", onMove);
    cv.parentElement?.addEventListener("mouseleave", onLeave);

    const w0 = cv.clientWidth || 800;
    const h0 = cv.clientHeight || 200;
    const dots = Array.from({ length: density }, () => ({
      x: Math.random() * w0,
      y: Math.random() * h0,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.6,
    }));

    const LINK = 120;
    const draw = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      ctx.clearRect(0, 0, w, h);

      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > w) d.vx *= -1;
        if (d.y < 0 || d.y > h) d.vy *= -1;

        // Gentle pull toward the cursor makes the field feel responsive.
        const dx = mouse.x - d.x;
        const dy = mouse.y - d.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140 && dist > 1) {
          d.x += (dx / dist) * 0.35;
          d.y += (dy / dist) * 0.35;
        }
      }

      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i];
          const b = dots[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > LINK) continue;
          ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${0.22 * (1 - dist / LINK)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const d of dots) {
        const near = Math.hypot(mouse.x - d.x, mouse.y - d.y) < 140;
        const c = near ? accent : color;
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${near ? 0.9 : 0.5})`;
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
      cv.parentElement?.removeEventListener("mousemove", onMove);
      cv.parentElement?.removeEventListener("mouseleave", onLeave);
    };
  }, [density]);

  return <canvas ref={ref} className={`absolute inset-0 w-full h-full ${className}`} />;
}
