// Cigarra-holograma do app: a mesma ideia da home (site/landing-viva/anim/anim-heretic-nebula.js) — a cigarra do
// logo feita de partículas, com ~6% virando caracteres hex. Aqui ela fica parada no lugar (não gira), para as
// etiquetas da Prancha apontarem sempre para o mesmo ponto. Monta a partir de uma nuvem ao abrir, respira devagar,
// cintila, o ponteiro afasta as partículas (voltam por mola) e as asas tremem quando `pulse` muda (digitando).
// prefers-reduced-motion: um quadro parado. Pausa fora da tela e com a aba escondida.
import { useEffect, useRef } from "react";

export interface HoloBox { x: number; y: number; w: number; h: number }

interface HoloCicadaProps {
  /** Imagem com transparência; as partículas saem dos pixels opacos. */
  src: string;
  className?: string;
  /** Ponto (0–1 no desenho) que acende, ex.: a etiqueta em hover. */
  focus?: { x: number; y: number } | null;
  /** Retângulo do desenho dentro do contêiner, em px (para as linhas da Prancha). */
  onBox?: (box: HoloBox) => void;
  /** Muda a cada tecla: as asas tremem por um instante. */
  pulse?: number;
}

type Particle = { hx: number; hy: number; x: number; y: number; vx: number; vy: number; b: number; ph: number; sp: number; ch?: string; wing: boolean };

const HEX = "0123456789ABCDEF";
const BONE = "232,226,208";

export function HoloCicada({ src, className, focus = null, onBox, pulse = 0 }: HoloCicadaProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const focusRef = useRef(focus);
  const onBoxRef = useRef(onBox);
  const energy = useRef(0);
  const kick = useRef<() => void>(() => {});
  focusRef.current = focus;
  onBoxRef.current = onBox;

  useEffect(() => { if (pulse) { energy.current = 1; kick.current(); } }, [pulse]);
  useEffect(() => { kick.current(); }, [focus]);

  useEffect(() => {
    const host = wrapRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!host || !cv || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = matchMedia("(pointer: coarse)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let pts: Particle[] = [];
    const dust = Array.from({ length: touch ? 50 : 110 }, () => ({ x: Math.random() * 1.3 - .15, y: Math.random() * 1.5 - .25, b: .06 + Math.random() * .2, ph: Math.random() * 6.28 }));
    let W = 1, H = 1, ar = 2.2, box: HoloBox = { x: 0, y: 0, w: 1, h: 1 };
    let mx = -9999, my = -9999, raf = 0, visible = true, running = false;
    const t0 = performance.now();

    const layout = () => {
      const r = host.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      let w = W * .9, h = w / ar;
      if (h > H * .86) { h = H * .86; w = h * ar; }
      box = { x: (W - w) / 2, y: (H - h) / 2, w, h };
      onBoxRef.current?.(box);
    };

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const breathe = reduced ? 1 : 1 + .012 * Math.sin(t * Math.PI * 2 / 7);
      const f = focusRef.current;
      const fx = f ? box.x + f.x * box.w : -9999, fy = f ? box.y + f.y * box.h : -9999;
      const e = energy.current;

      // poeira em volta: dá profundidade de holograma
      ctx.fillStyle = `rgb(${BONE})`;
      for (const d of dust) {
        ctx.globalAlpha = reduced ? d.b : d.b * (.6 + .4 * Math.sin(t * .7 + d.ph));
        ctx.fillRect(box.x + d.x * box.w, box.y + d.y * box.h + (reduced ? 0 : Math.sin(t * .3 + d.ph) * 3), 1, 1);
      }

      ctx.font = `500 8px "Geist Mono Variable", ui-monospace, monospace`;
      for (const p of pts) {
        let hx = cx + (box.x + p.hx * box.w - cx) * breathe;
        let hy = cy + (box.y + p.hy * box.h - cy) * breathe;
        if (p.wing && e > .01) hy += Math.sin(t * 55 + p.hx * 30) * 1.6 * e;
        if (!reduced) {
          const dx = p.x - mx, dy = p.y - my, dist = Math.hypot(dx, dy);
          if (dist < 70 && dist > .01) { const k = (70 - dist) / 70 * 2.4; p.vx += dx / dist * k; p.vy += dy / dist * k; }
          p.vx = (p.vx + (hx - p.x) * .045) * .84;
          p.vy = (p.vy + (hy - p.y) * .045) * .84;
          p.x += p.vx; p.y += p.vy;
        } else { p.x = hx; p.y = hy; }
        let a = p.b * (reduced ? .85 : .62 + .38 * Math.sin(t * p.sp + p.ph));
        if (f && Math.hypot(p.x - fx, p.y - fy) < 48) a = Math.min(1, a + .55);
        ctx.globalAlpha = a;
        if (p.ch) {
          if (!reduced && Math.random() < .004) p.ch = HEX.charAt((Math.random() * 16) | 0);
          ctx.fillText(p.ch, p.x - 2, p.y + 3);
        } else ctx.fillRect(p.x, p.y, 1.25, 1.25);
      }
      ctx.globalAlpha = 1;
      energy.current = e * .93;
    };

    const loop = (now: number) => {
      draw(now);
      if (visible && !document.hidden) raf = requestAnimationFrame(loop);
      else running = false;
    };
    const start = () => {
      if (reduced) { draw(performance.now()); return; }
      if (running || !visible || document.hidden) return;
      running = true; raf = requestAnimationFrame(loop);
    };
    kick.current = start;

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      ar = img.width / img.height || 2.2;
      const sw = 360, sh = Math.max(1, Math.round(sw / ar));
      const oc = document.createElement("canvas"); oc.width = sw; oc.height = sh;
      const o = oc.getContext("2d", { willReadFrequently: true });
      if (!o) return;
      o.drawImage(img, 0, 0, sw, sh);
      const data = o.getImageData(0, 0, sw, sh).data;
      const cand: [number, number][] = [];
      for (let y = 0; y < sh; y += 2) for (let x = 0; x < sw; x += 2) if (data[(y * sw + x) * 4 + 3]! > 110) cand.push([x / sw, y / sh]);
      for (let i = cand.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const tmp = cand[i]!; cand[i] = cand[j]!; cand[j] = tmp; }
      layout();
      pts = cand.slice(0, touch ? 1100 : 2200).map(([hx, hy]) => ({
        hx, hy,
        // nasce espalhada numa nuvem em volta e se junta na cigarra (no reduced, já nasce no lugar)
        x: box.x + box.w / 2 + (Math.random() - .5) * box.w * 1.4, y: box.y + box.h / 2 + (Math.random() - .5) * box.h * 2,
        vx: 0, vy: 0, b: .45 + Math.random() * .55, ph: Math.random() * 6.28, sp: .6 + Math.random() * 1.6,
        ch: Math.random() < .06 ? HEX.charAt((Math.random() * 16) | 0) : undefined, wing: Math.abs(hx - .5) > .1,
      }));
      start();
    };
    img.src = src;

    layout();
    const ro = new ResizeObserver(() => { layout(); start(); });
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; start(); });
    io.observe(host);
    const onVis = () => start();
    document.addEventListener("visibilitychange", onVis);
    const onMove = (ev: PointerEvent) => { const r = host.getBoundingClientRect(); mx = ev.clientX - r.left; my = ev.clientY - r.top; start(); };
    const onLeave = () => { mx = my = -9999; };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf); running = false;
      ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      kick.current = () => {};
    };
  }, [src]);

  return (
    <div ref={wrapRef} className={className ? `hx-holo ${className}` : "hx-holo"} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
