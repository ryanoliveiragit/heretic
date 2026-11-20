import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import holo from "@pro/holo-card/holo-card.module.css";

/* Superfície cromada do 451 (pedido do Ryan, 19/11): as camadas de foil, glitter e brilho do HoloCard da biblioteca,
   sem inclinar, sem virar e sem proporção fixa, para caber uma resposta inteira. O brilho segue o ponteiro e, parado,
   passeia devagar pelo cartão. Com "reduzir movimento" fica parado. */
export function HoloSurface({ children, className, shine = 0.3 }: { children: ReactNode; className?: string; shine?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const alvo = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (x: number, y: number) => {
      el.style.setProperty("--holo-x", `${x}%`);
      el.style.setProperty("--holo-y", `${y}%`);
      el.style.setProperty("--holo-foil-x", `${20 + x * 0.6}%`);
      el.style.setProperty("--holo-foil-y", `${20 + y * 0.6}%`);
      el.style.setProperty("--holo-glitter-x", `${(x - 50) * 0.12}px`);
      el.style.setProperty("--holo-glitter-y", `${(y - 50) * 0.12}px`);
      el.style.setProperty("--holo-hue", `${(x - 50) * 0.5}deg`);
    };
    el.style.setProperty("--holo-shine", String(shine));
    set(30, 20);
    if (reduced) return;
    let raf = 0;
    let cx = 30, cy = 20;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const tx = alvo.current?.x ?? 50 + 38 * Math.sin(t * 0.35);
      const ty = alvo.current?.y ?? 40 + 30 * Math.sin(t * 0.23 + 1.2);
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      set(cx, cy);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, shine]);

  return (
    <div
      ref={ref}
      className={["h-cromo", className].filter(Boolean).join(" ")}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        alvo.current = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
      }}
      onPointerLeave={() => (alvo.current = null)}
    >
      <div className="h-cromo-in">
        <div className="h-cromo-conteudo">{children}</div>
        <span className={holo.foil} aria-hidden="true" />
        <span className={holo.glitter} aria-hidden="true" />
        <span className={holo.glare} aria-hidden="true" />
      </div>
    </div>
  );
}
