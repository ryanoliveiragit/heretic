// Small, safe Markdown renderer for chat replies (no HTML is injected: everything becomes React nodes).
// Blocks: ``` code fences, # headings, - / * / 1. lists, > quotes, --- rules, paragraphs.
// Inline: **bold**, *italic*, `code`, [text](https://link).
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Mermaid } from "./mermaid";

// Bloco de código com cabeçalho (linguagem + copiar), no estilo do redesign.
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* negado */ } };
  return (
    <div className="md-codewrap">
      <div className="md-codebar"><span className="md-codelang">{lang || "código"}</span><button type="button" className="md-codecopy" onClick={copy} aria-label="Copiar código">{copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}</button></div>
      <pre className="md-pre" data-lang={lang || undefined}><code>{code}</code></pre>
    </div>
  );
}

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0], k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k} className="md-code">{t.slice(1, -1)}</code>);
    else if (m[2] || m[3]) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (m[4]) out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    else if (m[5]) { const label = t.slice(1, t.indexOf("](")); out.push(<a key={k} href={m[6]} target="_blank" rel="noopener noreferrer">{label}</a>); }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, caret }: { text: string; caret?: boolean }) {
  // Normaliza cercas de código: modelos às vezes colam ```bash direto depois do texto ou com o
  // comando na mesma linha, o que quebrava a renderização (crases soltas dentro de listas).
  const src = text.replace(/\r\n?/g, "\n")
    .replace(/([^\n`])(```)/g, "$1\n$2")          // ``` após conteúdo → nova linha
    .replace(/(^|\n)(```[A-Za-z0-9+-]*)[ \t]+(?=\S)/g, "$1$2\n"); // ```lang <código> → quebra após a linguagem
  const lines = src.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0, b = 0;
  const para: string[] = [];
  const flush = () => { if (para.length) { blocks.push(<p key={`p${b++}`}>{inline(para.join(" "), `p${b}`)}</p>); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const fence = /^\s*```(\w*)/.exec(line);
    if (fence) {
      flush();
      const body: string[] = []; i++;
      let closed = false;
      while (i < lines.length) { if (/^\s*```/.test((lines[i] ?? ""))) { closed = true; break; } body.push((lines[i++] ?? "")); }
      if (closed) i++;
      const lang = (fence[1] || "").toLowerCase();
      const bodyText = body.join("\n");
      // Detecta Mermaid pelo CONTEÚDO também: se o modelo esquece a tag ```mermaid e manda só
      // ```+flowchart, ainda desenhamos o diagrama em vez de mostrar o código cru.
      const looksMermaid = /^\s*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/i.test(bodyText)
        || /^\s*(?:sequenceDiagram|mindmap|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|journey|gitGraph|timeline|quadrantChart|pie\b)/i.test(bodyText);
      // Diagrama só quando o bloco fechou (evita renderizar Mermaid incompleto durante o streaming).
      if ((lang === "mermaid" || looksMermaid) && closed) blocks.push(<Mermaid key={`m${b++}`} code={bodyText} />);
      else blocks.push(<CodeBlock key={`c${b++}`} code={bodyText} lang={fence[1] || undefined} />);
      continue;
    }
    // Mermaid SEM cerca: modelos às vezes escrevem "flowchart TD ..." como texto cru, sem ```.
    // Desenha o diagrama mesmo assim (coleta as linhas até a próxima linha em branco).
    const mmHead = /^\s*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/i.test(line)
      || /^\s*(?:sequenceDiagram|mindmap|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|journey|gitGraph|timeline|quadrantChart|pie)\b/i.test(line);
    if (mmHead) {
      flush(); const mm: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim() !== "" && !/^\s*```/.test(lines[i] ?? "")) mm.push(lines[i++] ?? "");
      blocks.push(<Mermaid key={`m${b++}`} code={mm.join("\n")} />);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); const L = Math.min(4, (h[1] ?? "").length + 2); const Tag = (`h${L}`) as "h3" | "h4" | "h5" | "h6"; blocks.push(<Tag key={`h${b++}`} className="md-h">{inline(h[2] ?? "", `h${b}`)}</Tag>); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); blocks.push(<hr key={`r${b++}`} />); i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      flush(); const q: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test((lines[i] ?? ""))) q.push((lines[i++] ?? "").replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={`q${b++}`}>{inline(q.join(" "), `q${b}`)}</blockquote>); continue;
    }
    const ul = /^\s*[-*•]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      flush(); const ordered = ol.test(line), items: string[] = [];
      while (i < lines.length && (ordered ? ol : ul).test((lines[i] ?? ""))) {
        let item = (lines[i++] ?? "").replace(ordered ? ol : ul, "");
        while (i < lines.length && /^\s{2,}\S/.test((lines[i] ?? "")) && !ul.test((lines[i] ?? "")) && !ol.test((lines[i] ?? "")) && !/^\s*```/.test((lines[i] ?? ""))) item += " " + (lines[i++] ?? "").trim();
        items.push(item);
      }
      const kids = items.map((it, j) => <li key={j}>{inline(it, `l${b}-${j}`)}</li>);
      blocks.push(ordered ? <ol key={`o${b++}`}>{kids}</ol> : <ul key={`u${b++}`}>{kids}</ul>);
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return <div className="md">{blocks}{caret ? <span className="md-caret" aria-hidden /> : null}</div>;
}
