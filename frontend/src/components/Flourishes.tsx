import { useEffect } from "react";

/**
 * Two whole-OS flourishes, driven by one pointer listener and one click
 * listener on the document rather than props threaded through every page:
 *
 *   - every .glass panel lights up under the cursor (the same spotlight the
 *     stat cards had, now everywhere)
 *   - every click leaves a ring where you pressed
 *
 * Delegation is the point. Twelve pages don't need to know these exist, and
 * adding a thirteenth gets them for free.
 */
export function Flourishes() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let lit: HTMLElement | null = null;

    const onMove = (e: PointerEvent) => {
      const panel = (e.target as HTMLElement)?.closest?.(".glass") as HTMLElement | null;
      if (panel !== lit) {
        lit?.classList.remove("lit");
        lit = panel;
        lit?.classList.add("lit");
      }
      if (!panel) return;
      const r = panel.getBoundingClientRect();
      panel.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      panel.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    };

    const onClick = (e: MouseEvent) => {
      const ring = document.createElement("span");
      ring.className = "click-ring";
      ring.style.left = `${e.clientX}px`;
      ring.style.top = `${e.clientY}px`;
      document.body.appendChild(ring);
      // Tie removal to the animation, not a timer, so a slow frame can't leave
      // a ring stranded on the page.
      ring.addEventListener("animationend", () => ring.remove(), { once: true });
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("click", onClick, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("click", onClick);
      lit?.classList.remove("lit");
    };
  }, []);

  return null;
}
