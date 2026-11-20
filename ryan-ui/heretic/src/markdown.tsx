// Small, safe Markdown renderer for chat replies (no HTML is injected: everything becomes React nodes).
// Blocks: ``` code fences, # headings, - / * / 1. lists, > quotes, --- rules, paragraphs.
// Inline: **bold**, *italic*, `code`, [text](https://link).
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Mermaid } from "./mermaid";
import { RadioCards } from "@pro/radio-cards/radio-cards";

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

// Bloco ```ask: a IA pergunta algo (ex.: "Qual seu SO?") e a 1ª linha vira a pergunta e cada
// "- opção" vira uma linha clicável. Clicar envia a opção como a próxima mensagem (igual aos cards
// de pergunta do chat). Fica desabilitado enquanto a resposta ainda está chegando (caret).
// LISTA VERTICAL (dono 18/11): uma opção por linha, com o RadioCards da ryan-ui em layout="list" —
// antes eram pílulas lado a lado, que ficavam apertadas e pareciam chips em vez de escolhas.
function AskBlock({ body, onOption, disabled }: { body: string; onOption?: (v: string) => void; disabled?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const opts: string[] = [];
  const qLines: string[] = [];
  for (const raw of body.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const mo = /^[-*]\s+(.+)$/.exec(l);
    if (mo) opts.push((mo[1] ?? "").trim());
    else if (opts.length === 0) qLines.push(l); // a pergunta vem antes das opções
  }
  const question = qLines.join(" ");
  if (!opts.length) return <CodeBlock code={body} lang="ask" />; // malformado → mostra cru
  // Cada opção pode trazer uma descrição depois de " — " (ou " - "): vira rótulo + descrição na linha
  // (ótimo pros candidatos de pessoa: "Ana Souza — desenvolvedora, Campinas SP").
  const options = opts.map((o) => {
    const m = /^(.+?)\s+[—–-]\s+(.+)$/.exec(o);
    return m ? { value: o, label: m[1]!.trim(), description: m[2]!.trim() } : { value: o, label: o, description: "" };
  });
  const choose = (v: string) => { if (disabled || picked || !onOption) return; setPicked(v); onOption(v); };
  return (
    <div className="md-ask">
      {question ? <p className="md-ask-q">{inline(question, "ask-q")}</p> : null}
      <RadioCards
        layout="list"
        className="md-ask-list"
        aria-label={question || "Opções"}
        value={picked}
        onValueChange={choose}
        disabled={disabled || !onOption}
        options={options.map((o) => ({
          value: o.value,
          label: o.label,
          description: o.description || undefined,
          // depois de escolher, as outras ficam apagadas (a escolha já foi enviada)
          disabled: !!picked && picked !== o.value,
        }))}
      />
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

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
}

function tableDivider(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

// Recupera o formato quebrado visto em respostas reais: uma linha "bash", linha em branco e
// depois comandos, sem as cercas. Só converte quando o primeiro comando é reconhecido.
function normalizeModelSlips(lines: string[]): string[] {
  const out: string[] = [];
  const command = /^\s*(?:#|\\$|curl|wget|ollama|docker|git|cd|python\d*|pipx?|vllm|sudo|npm|npx|go|source|export)(?:\s|$)/;
  for (let i = 0; i < lines.length; i++) {
    const label = /^\s*(bash|sh|shell|zsh)\s*$/i.exec(lines[i] ?? "");
    if (label && !(lines[i + 1] ?? "").trim() && command.test(lines[i + 2] ?? "")) {
      const body: string[] = [];
      let j = i + 2;
      while (j < lines.length && (lines[j] ?? "").trim()) body.push(lines[j++] ?? "");
      out.push("```" + label[1]!.toLowerCase(), ...body, "```");
      i = j - 1;
      continue;
    }
    out.push(lines[i] ?? "");
  }
  return out;
}

export function Markdown({ text, caret, onOption }: { text: string; caret?: boolean; onOption?: (v: string) => void }) {
  // Normaliza cercas de código: modelos às vezes colam ```bash direto depois do texto ou com o
  // comando na mesma linha, o que quebrava a renderização (crases soltas dentro de listas).
  const src = text.replace(/\r\n?/g, "\n")
    .replace(/([^\n`])(```)/g, "$1\n$2")          // ``` após conteúdo → nova linha
    .replace(/(^|\n)(```[A-Za-z0-9+-]*)[ \t]+(?=\S)/g, "$1$2\n"); // ```lang <código> → quebra após a linguagem
  // Alguns modelos emitem a tabela inteira numa linha ("... | |---| ... | | dado |").
  // O separador "| |" entre registros vira quebra de linha antes do parser de tabela.
  const lines = normalizeModelSlips(src.split("\n").flatMap(line =>
    /^\s*\|.*\|\s*$/.test(line) && /\|\s+\|/.test(line) ? line.replace(/\|\s+\|/g, "|\n|").split("\n") : [line]
  ));
  const blocks: ReactNode[] = [];
  // Cards de pergunta (```ask/```escolha) vão SEMPRE por último no turno, mesmo se o modelo escrever
  // mais texto depois deles (dono 18/11). Assim a pergunta é a última coisa na tela e o usuário
  // responde antes de qualquer continuação — nada de "disparar o resto" antes da resposta.
  const asks: ReactNode[] = [];
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
      // Modelos às vezes fecham a cerca com 1–2 crases soltas (em vez de ```); limpa a sobra pra não "abrir" o bloco.
      while (body.length && /^\s*`{1,2}\s*$/.test(body[body.length - 1] ?? "")) body.pop();
      const lang = (fence[1] || "").toLowerCase();
      const bodyText = body.join("\n");
      // ```ask (e variantes que o modelo às vezes inventa: select/options/escolha/pergunta): pergunta com
      // opções clicáveis. Só vira card quando há opções "- " de verdade; senão cai pro bloco de código normal.
      const looksAsk = /^(ask|select|options?|choices?|escolha|op[çc][õo]es|pergunta)$/i.test(lang) && /(^|\n)\s*[-*]\s+\S/.test(bodyText);
      if (looksAsk) { asks.push(<AskBlock key={`a${b++}`} body={bodyText} onOption={onOption} disabled={!!caret} />); continue; }
      // Detecta Mermaid pelo CONTEÚDO também: se o modelo esquece a tag ```mermaid e manda só
      // ```+flowchart, ainda desenhamos o diagrama em vez de mostrar o código cru.
      const looksMermaid = /^\s*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/i.test(bodyText)
        || /^\s*(?:sequenceDiagram|mindmap|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|journey|gitGraph|timeline|quadrantChart|pie\b)/i.test(bodyText);
      // Renderiza o diagrama quando o bloco fechou OU quando a resposta terminou (!caret), mesmo com cerca malformada.
      // Durante o streaming (caret) espera fechar pra não piscar Mermaid incompleto.
      if ((lang === "mermaid" || looksMermaid) && (closed || !caret)) blocks.push(<Mermaid key={`m${b++}`} code={bodyText} />);
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
    // Tabela Markdown (inclusive a forma achatada normalizada acima).
    if (line.includes("|") && i + 1 < lines.length && tableDivider(lines[i + 1] ?? "")) {
      flush();
      const headers = tableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim()) rows.push(tableCells(lines[i++] ?? ""));
      const key = `t${b++}`;
      blocks.push(
        <div className="md-tablewrap" key={key}>
          <table>
            <thead><tr>{headers.map((cell, j) => <th key={j} scope="col">{inline(cell, `${key}-h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, j) => <tr key={j}>{headers.map((_, k) => <td key={k}>{inline(row[k] ?? "", `${key}-r${j}c${k}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); const L = Math.min(4, (h[1] ?? "").length + 2); const Tag = (`h${L}`) as "h3" | "h4" | "h5" | "h6"; blocks.push(<Tag key={`h${b++}`} className="md-h">{inline(h[2] ?? "", `h${b}`)}</Tag>); i++; continue; }
    // Modelos às vezes escrevem "Passo 1: título" sem ###; preserva a hierarquia visual.
    if (/^\s*Passo\s+\d+\s*[:\-–—]\s*\S/i.test(line)) { flush(); blocks.push(<h4 key={`s${b++}`} className="md-h md-step">{inline(line.trim(), `s${b}`)}</h4>); i++; continue; }
    // Também recupera um título curto sem ##, desde que venha depois de um parágrafo e antes
    // de uma linha em branco. Listas, código e frases com pontuação final continuam intocados.
    const plainHeading = para.length > 0 && /^[\p{Lu}0-9"“]/u.test(line.trim()) && line.trim().length >= 8 && line.trim().length <= 72
      && !/[.!?;:,]$/.test(line.trim()) && !(lines[i + 1] ?? "").trim() && !/^\s*(?:[-*+>]\s|```|\d+[.)]\s|\|)/.test(line);
    if (plainHeading) { flush(); blocks.push(<h4 key={`g${b++}`} className="md-h md-plain">{inline(line.trim(), `g${b}`)}</h4>); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); blocks.push(<hr key={`r${b++}`} />); i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      flush(); const q: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test((lines[i] ?? ""))) q.push((lines[i++] ?? "").replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={`q${b++}`}>{inline(q.join(" "), `q${b}`)}</blockquote>); continue;
    }
    const ul = /^\s*[-*•]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      flush(); const ordered = ol.test(line), items: string[] = [];
      const start = ordered ? Number(/^\s*(\d+)/.exec(line)?.[1] ?? 1) : 1;
      while (i < lines.length && (ordered ? ol : ul).test((lines[i] ?? ""))) {
        let item = (lines[i++] ?? "").replace(ordered ? ol : ul, "");
        while (i < lines.length && /^\s{2,}\S/.test((lines[i] ?? "")) && !ul.test((lines[i] ?? "")) && !ol.test((lines[i] ?? "")) && !/^\s*```/.test((lines[i] ?? ""))) item += " " + (lines[i++] ?? "").trim();
        items.push(item);
      }
      const kids = items.map((it, j) => <li key={j}>{inline(it, `l${b}-${j}`)}</li>);
      // Um bloco de código pode separar "1." de "2."; o start impede que toda parte volte a 01.
      blocks.push(ordered ? <ol key={`o${b++}`} start={start} style={{ counterReset: `hxol ${start - 1}` }}>{kids}</ol> : <ul key={`u${b++}`}>{kids}</ul>);
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return <div className="md">{blocks}{asks}{caret ? <span className="md-caret" aria-hidden /> : null}</div>;
}
