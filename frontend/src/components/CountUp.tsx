import { useEffect, useState } from "react";

/** Rolls a number up to its value. Non-numeric values render unchanged. */
export function CountUp({ value, duration = 800 }: { value: string | number; duration?: number }) {
  const target = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  const suffix = typeof value === "string" ? String(value).replace(/[\d.,-]/g, "") : "";
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  if (!Number.isFinite(target)) return <>{value}</>;
  const rounded = Number.isInteger(target) ? Math.round(n) : n.toFixed(1);
  return (
    <>
      {rounded}
      {suffix}
    </>
  );
}
