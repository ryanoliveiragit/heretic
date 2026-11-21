// Renderiza diagramas Mermaid (flowchart, sequence, mindmap…) que o modelo gera em blocos ```mermaid.
// O mermaid é pesado, então carrega sob demanda (dynamic import) só quando um diagrama aparece.
// Se o diagrama estiver malformado, cai no fallback de bloco de código.
// 20/11: tema do 451 (preto + grafite + prata, acento branco osso) e entrada animada: caixas surgem em
// sequência e as setas se desenham, no mesmo ritmo dos componentes da home. Respeita "reduzir movimento".
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@pro/copy-button/copy-button";

type MermaidApi = { initialize: (c: unknown) => void; render: (id: string, code: string) => Promise<{ svg: string }> };
let mermaidPromise: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(m => {
      const mermaid = m.default as unknown as MermaidApi;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: "Switzer, ui-sans-serif, system-ui, sans-serif",
        flowchart: { curve: "basis", padding: 14, nodeSpacing: 34, rankSpacing: 46, htmlLabels: true },
        themeVariables: {
          darkMode: true,
          background: "transparent",
          fontSize: "14px",
          primaryColor: "#141418",
          primaryTextColor: "#F5F5F7",
          primaryBorderColor: "#8E8E98",
          secondaryColor: "#101013",
          secondaryTextColor: "#F5F5F7",
          secondaryBorderColor: "#5A5A63",
          tertiaryColor: "#0C0C0F",
          tertiaryTextColor: "#C8C8CE",
          tertiaryBorderColor: "#3A3A42",
          lineColor: "#7C7C86",
          textColor: "#C8C8CE",
          edgeLabelBackground: "#0A0A0C",
          clusterBkg: "#0C0C0F",
          clusterBorder: "#2A2A30",
          noteBkgColor: "#16161A",
          noteTextColor: "#F5F5F7",
          noteBorderColor: "#E8E2D0",
          actorBkg: "#141418",
          actorBorder: "#8E8E98",
          actorTextColor: "#F5F5F7",
          signalColor: "#9A9AA3",
          signalTextColor: "#C8C8CE",
          // Pizza (21/11): sem estas cores as fatias saíam quase pretas no tema escuro.
          pie1: "#E8E2D0", pie2: "#1DB362", pie3: "#5B8CFF", pie4: "#F2A93B", pie5: "#C084FC", pie6: "#8E8E98", pie7: "#5A5A63", pie8: "#3A3A42",
          pieStrokeColor: "#0A0A0C",
          pieOuterStrokeColor: "#2A2A30",
          pieTitleTextColor: "#F5F5F7",
          pieSectionTextColor: "#0A0A0C",
          pieLegendTextColor: "#C8C8CE",
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

// Conserta erros comuns de Mermaid que os modelos cometem, pra o diagrama renderizar em vez de
// cair no fallback de código cru (ex.: rótulo de aresta sem o "|" de abertura: "--> Sim| X").
function repairMermaid(code: string): string {
  return code
    // rótulo de aresta sem o "|" de abertura → "-->|Sim| X"
    .replace(/(--+>|--+|-\.->|==+>)(?!\s*\|)([ \t]*)([^\n|>[{(]+?)[ \t]*\|/g, "$1|$3|")
    // dois "|" seguidos vazios → remove
    .replace(/\|\s*\|/g, "|");
}

/** Nome no topo do cartão conforme o tipo (antes era sempre "Fluxograma", até em gráfico de pizza). */
function nomeDoDesenho(code: string): string {
  const tipo = (code.trim().split(/\s/)[0] || "").toLowerCase();
  if (tipo === "pie") return "Gráfico de pizza";
  if (tipo.startsWith("xychart")) return "Gráfico";
  if (tipo === "sequencediagram") return "Sequência";
  if (tipo === "mindmap") return "Mapa mental";
  if (tipo === "gantt" || tipo === "timeline") return "Cronograma";
  if (tipo === "flowchart" || tipo === "graph") return "Fluxograma";
  return "Diagrama";
}

/** Bloco parece Mermaid mesmo sem a tag ```mermaid. */
export function pareceMermaid(lang: string | undefined, code: string): boolean {
  if ((lang || "").toLowerCase() === "mermaid") return true;
  return /^\s*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/i.test(code)
    || /^\s*(?:sequenceDiagram|mindmap|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|journey|gitGraph|timeline|quadrantChart|pie\b|xychart(?:-beta)?\b|sankey(?:-beta)?\b|block-beta\b|radar-beta\b|packet-beta\b|kanban\b|architecture-beta\b|requirementDiagram\b)/i.test(code);
}

// Entrada animada: cada caixa recebe a sua vez (--i) e cada seta o próprio comprimento para "se desenhar".
function animar(raiz: HTMLElement) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const svg = raiz.querySelector("svg");
  if (!svg) return;
  const nos = svg.querySelectorAll<SVGGElement>(".node, .actor, .note, .mindmap-node, .task, .section");
  nos.forEach((n, i) => n.style.setProperty("--i", String(i)));
  svg.querySelectorAll<SVGPathElement>("path.flowchart-link, .edgePaths path, path.relation, line.messageLine0, line.messageLine1").forEach((p, i) => {
    const len = typeof p.getTotalLength === "function" ? Math.ceil(p.getTotalLength()) : 300;
    p.style.setProperty("--len", String(len));
    p.style.setProperty("--i", String(i));
  });
  svg.querySelectorAll<SVGGElement>(".edgeLabel").forEach((l, i) => l.style.setProperty("--i", String(i)));
  svg.classList.add("hx-mmd-anim");
}

let seq = 0;
export function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    setErr(false);
    const run = async () => {
      const mermaid = await loadMermaid();
      const base = code.trim();
      const variants = [...new Set([repairMermaid(base), base])];
      for (const v of variants) {
        try { const { svg } = await mermaid.render(`hx-mmd-${seq++}`, v); if (alive) setSvg(svg); return; }
        catch { /* tenta a próxima variante */ }
      }
      if (alive) setErr(true);
    };
    run().catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [code]);
  useEffect(() => { if (svg && ref.current) animar(ref.current); }, [svg]);
  if (err) return <pre className="md-pre" data-lang="mermaid"><code>{code}</code></pre>;
  return (
    <figure className="hx-mermaid hx-mmd-card" aria-label="Diagrama">
      <figcaption className="hx-mmd-top">
        <span className="hx-mmd-tag">{nomeDoDesenho(code)}</span>
        <CopyButton value={code} variant="plain" label="Copiar código" copiedLabel="Copiado" failedLabel="Não copiou" className="hx-mmd-copy" />
      </figcaption>
      {svg
        ? <div ref={ref} className="hx-mmd-body" dangerouslySetInnerHTML={{ __html: svg }} />
        : <div className="hx-mmd-body hx-mmd-espera" aria-label="Desenhando o diagrama"><span /><span /><span /></div>}
    </figure>
  );
}
