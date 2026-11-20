// Início "Prancha de espécime" (Claude Design "Heretic - Início Prancha", 18/11), com a cigarra-holograma da home
// no lugar da gravura (dono: "remova o H", "pode usar a cigarra holograma da home"). Texto à esquerda, alinhado à
// esquerda; a cigarra à direita; cada sugestão ligada a um ponto dela por uma linha fina, que acende no hover.
// As sugestões usam as classes do followList/followButton da ryan-ui (as mesmas de antes).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { HoloCicada, type HoloBox } from "./holo-cicada";

/** Para onde cada etiqueta aponta (0–1 no desenho): asa esquerda, tórax, cauda, asa direita. */
const TARGETS = [{ x: .2, y: .32 }, { x: .5, y: .38 }, { x: .5, y: .92 }, { x: .8, y: .32 }];

interface StartPlateProps {
  suggestions: string[];
  onPick: (q: string) => void;
  /** Classes da ryan-ui usadas no início (título e lista de sugestões). */
  classes: { title: string; list: string; button: string };
  /** Ícone de "ir" no fim de cada sugestão. */
  go?: ReactNode;
}

type Line = { d: string; tx: number; ty: number };

export function StartPlate({ suggestions, onPick, classes, go }: StartPlateProps) {
  const plateRef = useRef<HTMLDivElement>(null);
  const holoRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [box, setBox] = useState<HoloBox | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [pulse, setPulse] = useState(0);
  const [tick, setTick] = useState(0);

  const measure = useCallback(() => {
    const plate = plateRef.current, holo = holoRef.current;
    if (!plate || !holo || !box) { setLines([]); return; }
    const pr = plate.getBoundingClientRect(), hr = holo.getBoundingClientRect();
    // Empilhado (celular / coluna estreita: a cigarra ocupa a largura toda): sem linhas.
    if (hr.width > pr.width * .8) { setLines([]); return; }
    const knee = hr.left - pr.left + Math.max(0, box.x - 28);
    const next: Line[] = [];
    textRefs.current.slice(0, suggestions.length).forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = TARGETS[i % TARGETS.length]!;
      const sx = r.right - pr.left + 16, sy = r.top - pr.top + r.height / 2;
      const tx = hr.left - pr.left + box.x + t.x * box.w, ty = hr.top - pr.top + box.y + t.y * box.h;
      const kx = Math.max(sx + 16, knee);
      next.push({ d: `M${sx.toFixed(1)} ${sy.toFixed(1)}H${kx.toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}`, tx, ty });
    });
    setLines(next);
  }, [box, suggestions.length]);

  useLayoutEffect(() => { measure(); }, [measure, tick]);

  useEffect(() => {
    const plate = plateRef.current;
    if (!plate) return;
    const ro = new ResizeObserver(() => setTick(n => n + 1));
    ro.observe(plate);
    // Digitar na caixa de mensagem (mesma tela) faz as asas tremerem.
    const root = plate.closest(".hx-start") ?? plate.parentElement;
    const onInput = () => setPulse(n => n + 1);
    root?.addEventListener("input", onInput);
    document.fonts?.ready.then(() => setTick(n => n + 1)).catch(() => {});
    return () => { ro.disconnect(); root?.removeEventListener("input", onInput); };
  }, []);

  return (
    <div ref={plateRef} className="hx-plate">
      <div className="hx-plate-text">
        <p className="hx-plate-kicker">Prancha 451 — cigarra</p>
        <p className={`${classes.title} hx-start-title`}>O que vamos pesquisar?</p>
        <ul className={`${classes.list} hx-plate-list`}>
          {suggestions.map((q, i) => (
            <li key={q}>
              <button
                type="button"
                className={`${classes.button} hx-plate-q`}
                data-on={active === i ? "" : undefined}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(a => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(a => (a === i ? null : a))}
                onClick={() => onPick(q)}
              >
                <span className="hx-plate-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span ref={el => { textRefs.current[i] = el; }} className="hx-plate-t">{q}</span>
                {go}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div ref={holoRef} className="hx-plate-holo">
        <HoloCicada src="/icons/cicada.png" focus={active === null ? null : TARGETS[active % TARGETS.length]!} onBox={setBox} pulse={pulse} />
      </div>
      {lines.length ? (
        <svg className="hx-plate-lines" aria-hidden="true">
          {lines.map((l, i) => (
            <g key={i} data-on={active === i ? "" : undefined}>
              <path d={l.d} />
              <circle cx={l.tx} cy={l.ty} r={2.2} />
            </g>
          ))}
        </svg>
      ) : null}
      {/* Segredo da prancha: "pergunte o que quiser" em base64. */}
      <p className="hx-plate-cipher" aria-hidden="true">cGVyZ3VudGUgbyBxdWUgcXVpc2Vy</p>
    </div>
  );
}

/** Início "C · 451 queimando" (Claude Design "451 - App", escolhido pelo dono em 18/11): o 451 gigante queimando
 *  bem apagado atrás; no centro o título, a caixa de mensagem logo abaixo e as sugestões em linhas. */
export function StartBurn({ suggestions, onPick, go, composer }: Omit<StartCenterProps, "classes">) {
  const rootRef = useRef<HTMLDivElement>(null);
  const emberRef = useRef<HTMLDivElement>(null);
  const energy = useRef({ holoEnergy: 0 });
  const [size, setSize] = useState(0);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Tamanho do número pela largura da área: 880 no computador, ~420 no celular (como no desenho).
    const measure = () => { const w = root.clientWidth; setSize(w >= 700 ? 880 : w >= 480 ? 620 : 420); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    // Digitar aviva as brasas.
    const onInput = () => { energy.current.holoEnergy = 1; };
    root.addEventListener("input", onInput);
    return () => { ro.disconnect(); root.removeEventListener("input", onInput); };
  }, []);
  useEffect(() => {
    const host = emberRef.current;
    if (!host || !size) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    import("./burning-451").then(m => { if (!cancelled) stop = m.startEmber(host, size, energy.current); }).catch(() => {});
    return () => { cancelled = true; stop?.(); };
  }, [size]);
  // Ordem fixa de "o que pesa" embaixo do título: só o que o produto faz (não muda com a sugestão escolhida).
  const FACTS = ["Sem conta", "Sem religião", "Sem desculpa"];
  return (
    <div ref={rootRef} className="hx-burn">
      <div ref={emberRef} className="hx-burn-ember" aria-hidden="true" />
      <div className="hx-burn-vignette" aria-hidden="true" />
      <div className="hx-burn-in">
        <h1 className="hx-burn-title">O que você quer fazer?</h1>
        <p className="hx-burn-facts" aria-label="Sem conta, sem religião, sem desculpa">
          {FACTS.map((f, i) => <span key={f}>{i ? <i aria-hidden="true">/</i> : null}{f}</span>)}
        </p>
        <div className="hx-dock hx-dock-start hx-burn-dock">{composer}</div>
        <ul className="hx-burn-list">
          {suggestions.map((q, i) => (
            <li key={q}>
              <button type="button" className="hx-burn-q" onClick={() => { energy.current.holoEnergy = 1; onPick(q); }}>
                <span className="hx-burn-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="hx-burn-t">{q}</span>
                {go}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface StartCenterProps {
  suggestions: string[];
  onPick: (q: string) => void;
  classes: { title: string; list: string; button: string };
  go?: ReactNode;
  /** Caixa de mensagem (e a linha de uso), logo abaixo do título. */
  composer: ReactNode;
}

/** Início "A · Centro" (Claude Design "451 - App", escolhido pelo dono em 18/11): um bloco só no meio da tela —
 *  cigarra-holograma pequena em cima, título numa linha, a caixa de mensagem logo abaixo e as sugestões embaixo
 *  dela, alinhadas à esquerda. Sem legendas, sem texto cifrado e sem linhas até a cigarra. */
export function StartCenter({ suggestions, onPick, classes, go, composer }: StartCenterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Digitar na caixa de mensagem faz as asas tremerem.
    const onInput = () => setPulse(n => n + 1);
    root.addEventListener("input", onInput);
    return () => root.removeEventListener("input", onInput);
  }, []);
  return (
    <div ref={rootRef} className="hx-center">
      <div className="hx-center-holo">
        <HoloCicada src="/icons/cicada.png" pulse={pulse} />
      </div>
      <p className={`${classes.title} hx-start-title hx-center-title`}>O que vamos pesquisar?</p>
      <div className="hx-dock hx-dock-start hx-center-dock">{composer}</div>
      <ul className={`${classes.list} hx-center-list`}>
        {suggestions.map((q, i) => (
          <li key={q}>
            <button type="button" className={`${classes.button} hx-center-q`} onClick={() => onPick(q)}>
              <span className="hx-plate-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span className="hx-plate-t">{q}</span>
              {go}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
