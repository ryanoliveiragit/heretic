// Renderiza diagramas Mermaid (flowchart, sequence, mindmap…) que o modelo gera em blocos ```mermaid.
// O mermaid é pesado, então carrega sob demanda (dynamic import) só quando um diagrama aparece.
// Se o diagrama estiver malformado, cai no fallback de bloco de código.
import { useEffect, useState } from "react";

type MermaidApi = { initialize: (c: unknown) => void; render: (id: string, code: string) => Promise<{ svg: string }> };
let mermaidPromise: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(m => {
      const mermaid = m.default as unknown as MermaidApi;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "dark",
        fontFamily: "Switzer, ui-sans-serif, system-ui, sans-serif",
        themeVariables: {
          background: "#08080A",
          primaryColor: "#141417",
          primaryTextColor: "#F5F5F7",
          primaryBorderColor: "#F0335A",
          secondaryColor: "#0E0E11",
          tertiaryColor: "#0C0C0F",
          lineColor: "#6E6E76",
          textColor: "#C8C8CE",
          noteBkgColor: "#141417",
          noteTextColor: "#F5F5F7",
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

let seq = 0;
export function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState(false);
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
  if (err) return <pre className="md-pre" data-lang="mermaid"><code>{code}</code></pre>;
  if (!svg) return <div className="hx-mermaid" data-loading="1" aria-label="Rendering diagram">◴ diagrama…</div>;
  return <figure className="hx-mermaid" aria-label="Diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
