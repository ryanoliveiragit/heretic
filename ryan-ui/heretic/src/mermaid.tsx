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

let seq = 0;
export function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    setErr(false);
    loadMermaid()
      .then(mermaid => mermaid.render(`hx-mmd-${seq++}`, code.trim()))
      .then(({ svg }) => { if (alive) setSvg(svg); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [code]);
  if (err) return <pre className="md-pre" data-lang="mermaid"><code>{code}</code></pre>;
  if (!svg) return <div className="hx-mermaid" data-loading="1" aria-label="Rendering diagram">◴ diagrama…</div>;
  return <figure className="hx-mermaid" aria-label="Diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
