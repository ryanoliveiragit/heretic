// Componentes Pro da ryan-ui trazem textos fixos em inglês (rótulos, avisos, aria-label, title).
// O app é pt-BR: este observador troca esses textos na tela, igual ao desenho aprovado no
// Claude Design ("Heretic - Chat Pro"). Só roda com o idioma em PT; não toca no texto das
// respostas (.md), em campos de digitação nem em código.
import { useEffect } from "react";
import { lang } from "./i18n";
// Dicionário dos componentes Pro novos (sidebar, model picker/arena, research run, agent plan, image
// generation, trial banner, settings, billing, landing…): textos extraídos do código-fonte real da
// ryan-ui e traduzidos (heretic-design/i18n/pt-lote-*.json). Frases com {x} viram regras abaixo.
import EXTRA from "./ptbr-extra.json";

const TX: Record<string, string> = {
  // Ações da resposta (FeedbackActions / CopyButton)
  "Copy reply": "Copiar resposta", "Copied": "Copiado", "Copied!": "Copiado", "Copy": "Copiar", "Failed": "Falhou",
  "Regenerate": "Gerar de novo", "Regenerate reply": "Gerar a resposta de novo",
  "Good response": "Boa resposta", "Bad response": "Resposta ruim",
  "What was good?": "O que foi bom?", "What was good": "O que foi bom", "What went wrong?": "O que deu errado?", "Tell us what went wrong": "Conte o que deu errado",
  "Thanks for the feedback": "Obrigado pela avaliação", "Add details (optional)": "Adicione detalhes (opcional)",
  "Cancel": "Cancelar", "Close feedback": "Fechar avaliação", "Submit": "Enviar", "Send": "Enviar", "Skip": "Pular", "Try again": "Tentar de novo",
  "Reasons": "Motivos", "Feedback details": "Detalhes da avaliação", "Close": "Fechar",
  // Raciocínio (ReasoningBlock)
  "Thinking": "Pensando", "Thought process": "Raciocínio", "Finished thinking": "Terminou de pensar", "Copy reasoning": "Copiar raciocínio",
  "Stop": "Parar", "Retry": "Tentar de novo", "Stopped thinking": "Parou de pensar", "Stopped before finishing": "Parou antes de terminar",
  "Thinking interrupted": "Raciocínio interrompido", "The connection dropped before the model finished.": "A conexão caiu antes do modelo terminar.", "Done": "Pronto",
  // Busca e fontes (ToolCallGroup / SourceCards)
  "Sources": "Fontes", "Searching": "Buscando", "Search failed": "A busca falhou", "No sources found": "Nenhuma fonte encontrada", "Search again": "Buscar de novo",
  "Show fewer": "Mostrar menos", "Show less": "Mostrar menos", "No results": "Nenhum resultado", "Live": "Ao vivo",
  "Used 1 tool": "Buscou na web", "Using 1 tool": "Buscando na web", "Web search": "Busca na web", "Running": "Em andamento", "Error": "Erro",
  "Input": "Entrada", "Output": "Saída", "Waiting for the result": "Aguardando o resultado", "No output.": "Sem saída.",
  // Estatística (GenerationStats)
  "Generation": "Geração", "Generation stats": "Estatísticas da geração", "First token": "Primeiro token", "to first token": "até o 1º token",
  "Speed": "Velocidade", "Latency": "Latência", "Output tokens": "Tokens de saída", "Cost": "Custo", "Details": "Detalhes",
  "Show details": "Mostrar detalhes", "Hide details": "Ocultar detalhes", "Copy stats as JSON": "Copiar estatísticas em JSON",
  "Tokens": "Tokens", "Total": "Total", "Type": "Tipo", "Rate": "Taxa", "Cached input": "Entrada em cache", "Reasoning": "Raciocínio",
  "Streaming": "Gerando", "Waiting": "Aguardando", "Not started": "Não começou", "Stopped": "Parado", "The model": "O modelo",
  // Imagem (ImageReveal)
  "Image ready": "Imagem pronta", "Queued": "Na fila", "Denoising": "Tirando o ruído", "Decoding": "Revelando", "Decoding image": "Revelando a imagem",
  "Generate again": "Gerar de novo", "Generation failed": "A geração falhou", "Generated image": "Imagem gerada", "Generating image": "Gerando a imagem",
  "Generation progress": "Progresso da geração", "Generation state": "Estado da geração", "Retry generation": "Tentar gerar de novo",
  // Busca de comandos (CommandPalette / Dialog)
  "Command palette": "Buscar e comandos", "Search commands": "Buscar conversas, modelos e ações", "Clear search": "Limpar busca",
  "Close command palette": "Fechar a busca", "Command results": "Resultados", "Try a different word or clear the search.": "Tente outra palavra ou limpe a busca.",
  "Close dialog": "Fechar", "Esc": "Esc",
  // Pedaços soltos (o componente monta "+2 more" e "Generation stats" em partes)
  "more": "outras", "stats": "(estatísticas)",
  // Caixa de mensagem
  "Enter sends, Shift Enter adds a line. Type slash at the start of a line for commands.": "Enter envia, Shift+Enter pula linha. Digite / no início da linha para comandos.",
};

// Frases de status lidas por leitor de tela (às vezes chegam juntas num mesmo texto).
const SENT: Record<string, string> = {
  "Marked as a bad response.": "Marcada como resposta ruim.", "Marked as a good response.": "Marcada como boa resposta.",
  "Rating removed.": "Avaliação removida.", "Sending feedback.": "Enviando avaliação.", "Thanks for the feedback.": "Obrigado pela avaliação.",
  "Simulated, nothing was sent.": "Nada foi enviado.", "It helps improve future replies.": "Isso ajuda a melhorar as próximas respostas.",
  "Couldn't save your rating.": "Não deu para salvar a avaliação.", "Couldn't send your feedback.": "Não deu para enviar a avaliação.", "Try again.": "Tente de novo.",
  "Copied.": "Copiado.", "Copied to clipboard.": "Copiado.",
  "Tell us what was good, or skip.": "Conte o que foi bom ou pule.", "Tell us what went wrong, or skip.": "Conte o que deu errado ou pule.",
  "Tell us what was good.": "Conte o que foi bom.", "Tell us what went wrong.": "Conte o que deu errado.",
};

const num = (v: string) => v.replace(/^(\d+)\.(\d+)(m?s)$/, "$1,$2 $3").replace(/^(\d+)(m?s)$/, "$1 $2");
const RX: Array<[RegExp, (...m: string[]) => string]> = [
  [/^Thought for 1 second$/, () => "Pensou por 1 segundo"],
  [/^Thought for (\d+) seconds$/, (_m, a) => `Pensou por ${a} segundos`],
  [/^Thought for (\d+)s$/, (_m, a) => `Pensou por ${a} s`],
  [/^Thought for (\d+) minutes?(?: (\d+) seconds)?$/, (_m, a, b) => `Pensou por ${a} min${b ? ` ${b} s` : ""}`],
  [/^Stopped after (.+)$/, (_m, a) => `Parou depois de ${num(a)}`],
  [/^(.+) is thinking$/, (_m, a) => `${a} está pensando`],
  [/^(.+) reasoning$/, (_m, a) => `Raciocínio do ${a}`],
  [/^Reply from (.+)$/, (_m, a) => `Resposta do ${a}`],
  [/^(\d+) sources found$/, (_m, a) => `${a} fontes encontradas`],
  [/^(\d+) sources$/, (_m, a) => `${a} fontes`],
  [/^1 source$/, () => "1 fonte"],
  [/^Show all (\d+)$/, (_m, a) => `Mostrar as ${a}`],
  [/^Searching for (.+)$/, (_m, a) => `Buscando ${a}`],
  [/^Searching(…|\.\.\.)?$/, () => "Buscando…"],
  [/^Show (\d+) more sources?: (.+)$/, (_m, a, b) => `Mostrar mais ${a} ${a === "1" ? "fonte" : "fontes"}: ${b}`],
  [/^Model: (.+)$/, (_m, a) => `Modelo: ${a}`],
  [/^Web search: (.+)$/, (_m, a) => `Busca na web: ${a}`],
  [/^(Done|Running|Error|Failed|Denied), (.+)$/, (_m, a, b) => `${({ Done: "Pronto", Running: "Em andamento", Error: "Erro", Failed: "Falhou", Denied: "Negado" } as Record<string, string>)[a]}, ${b.replace(/(\d+)\.(\d+)s\b/g, "$1,$2 s")}`],
  [/^(\d+) results?$/, (_m, a) => `${a} ${a === "1" ? "resultado" : "resultados"}`],
  [/^Source (\d+): (.+), (.+?)(, opens in a new tab)?$/, (_m, a, b, c, d) => `Fonte ${a}: ${b}, ${c}${d ? ", abre em nova aba" : ""}`],
  [/^Source (\d+)$/, (_m, a) => `Fonte ${a}`],
  [/^(.+), opens in a new tab$/, (_m, a) => `${a}, abre em nova aba`],
  [/^\+ ?(\d+) more$/, (_m, a) => `+${a} outras`],
  [/^Used (\d+) tools$/, (_m, a) => `Usou ${a} ferramentas`],
  [/^Using (\d+) tools$/, (_m, a) => `Usando ${a} ferramentas`],
  [/^Done in (.+)$/, (_m, a) => `Pronto em ${num(a)}`],
  [/^Stopped at (.+)$/, (_m, a) => `Parou em ${num(a)}`],
  [/^Request sent to (.+)\.$/, (_m, a) => `Pedido enviado para ${a}.`],
  [/^Step (\d+) of (\d+)$/, (_m, a, b) => `Passo ${a} de ${b}`],
  [/^Step (\d+)$/, (_m, a) => `Passo ${a}`],
  [/^Show (\d+) more (tools?|calls?)$/, (_m, a) => `Mostrar mais ${a}`],
  [/^Copy (input|output)$/i, (_m, a) => (a.toLowerCase() === "input" ? "Copiar entrada" : "Copiar saída")],
  [/^\d+(\.\d+)?m?s$/, (m) => num(m)],
  [/^\d{1,3}(,\d{3})+$/, (m) => m.replace(/,/g, ".")],
];

// Frases do dicionário extra com {x} (pedaço que o código preenche) → regra: "Key ending in {x}" casa
// "Key ending in 4f2a" e devolve "Chave terminada em 4f2a". Mais específicas (mais texto fixo) primeiro.
const EXTRA_TX: Record<string, string> = {};
const EXTRA_RX: Array<[RegExp, string[]]> = [];
for (const [en, pt] of Object.entries(EXTRA as Record<string, string>)) {
  if (!en.includes("{x}")) { EXTRA_TX[en] = pt; continue; }
  const fixed = en.split("{x}");
  if (fixed.join("").replace(/[\s.,:;·–—-]/g, "").length < 3) continue; // só {x} e pontuação: arriscado demais
  const re = new RegExp("^" + fixed.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.+?)") + "$");
  EXTRA_RX.push([re, pt.split("{x}")]);
}
EXTRA_RX.sort((a, b) => b[0].source.length - a[0].source.length);
// Palavras comuns que só apareciam nos componentes de dados (fora do dicionário geral).
Object.assign(EXTRA_TX, {
  "Back": "Voltar", "Continue": "Continuar", "Today": "Hoje", "Plan": "Plano", "Start over": "Recomeçar", "Name": "Nome",
  "Billing": "Cobrança", "Upgrade": "Assinar o Pro", "Oct 14": "14 de out.", "Aug 28, 2026": "28 de ago. de 2026",
  "Sep 3, 2026": "3 de set. de 2026", "Sep 9, 2026": "9 de set. de 2026",
  "Model A": "Modelo A", "Model B": "Modelo B", "Ask a follow up": "Faça outra pergunta", "Ask a follow-up": "Faça outra pergunta",
  "yesterday": "ontem", "never": "nunca", "steps": "etapas", "step": "etapa", "sources": "fontes", "source": "fonte", "words": "palavras", "word": "palavra", "unread": "não lidas",
});
const MESES: Record<string, string> = { Jan: "jan.", Feb: "fev.", Mar: "mar.", Apr: "abr.", May: "maio", Jun: "jun.", Jul: "jul.", Aug: "ago.", Sep: "set.", Oct: "out.", Nov: "nov.", Dec: "dez." };
const EFFORT: Record<string, string> = { low: "baixo", medium: "médio", high: "alto", xhigh: "extra alto", max: "máximo", minimal: "mínimo" };
const plural = (n: string, one: string, many: string) => `${n} ${n === "1" ? one : many}`;
// Pedaços que as próprias bibliotecas montam ("9 days", "3 hours"): viram português dentro das regras.
const UNITS: Array<[RegExp, (...m: string[]) => string]> = [
  [/^(\d+) days?$/, (_m, n) => plural(n, "dia", "dias")],
  [/^(\d+) hours?$/, (_m, n) => plural(n, "hora", "horas")],
  [/^(\d+) minutes?$/, (_m, n) => plural(n, "minuto", "minutos")],
  [/^(\d+) weeks?$/, (_m, n) => plural(n, "semana", "semanas")],
  [/^(\d+) months?$/, (_m, n) => plural(n, "mês", "meses")],
  [/^(\d+) seats?$/, (_m, n) => plural(n, "lugar", "lugares")],
  [/^(\d+) steps?$/, (_m, n) => plural(n, "etapa", "etapas")],
  [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/, (_m, mo, d, y) => `${d} de ${MESES[mo]} de ${y}`],
  [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/, (_m, mo, d) => `${d} de ${MESES[mo]}`],
  [/^(\d+:\d+), (\d+) by (\d+)$/, (_m, r, w, hh) => `${r}, ${w} × ${hh}`],
  [/^Model: (.+), (low|medium|high|xhigh|max|minimal) effort\. Change model$/, (_m, a, e) => `Modelo: ${a}, esforço ${EFFORT[e]}. Trocar modelo`],
  [/^Search (.+)$/, (_m, a) => `Buscar em ${a}`],
];
const ENGLISHY = /\b(the|and|or|your|you|with|for|from|this|that|are|is|of|to|in|on|at|by|days?|hours?|minutes?|seconds?|left|used|seats?|steps?)\b/i;
/** Traduz o pedaço que uma regra {x} capturou; null se ele continuaria em inglês (aí a regra não vale). */
function trCapture(c: string): string | null {
  const t = c.trim();
  if (!t) return c;
  let r: string | undefined = TX[t] ?? EXTRA_TX[t];
  if (r === undefined) for (const [re, fn] of [...UNITS, ...RX]) { const m = re.exec(t); if (m) { r = fn(...(m as unknown as string[])); break; } }
  const out = r !== undefined ? c.replace(t, () => r!) : c;
  return ENGLISHY.test(out) ? null : out;
}

function tr(c: string): string | undefined {
  const r = TX[c] ?? EXTRA_TX[c];
  if (r !== undefined) return r;
  for (const [re, fn] of [...UNITS, ...RX]) { const m = re.exec(c); if (m) return fn(...(m as unknown as string[])); }
  rules: for (const [re, parts] of EXTRA_RX) {
    const m = re.exec(c);
    if (!m) continue;
    const caps: string[] = [];
    for (let i = 1; i < parts.length; i++) { const t = trCapture(m[i] ?? ""); if (t === null) continue rules; caps.push(t); }
    return parts.map((p, i) => p + (i < caps.length ? caps[i] : "")).join("");
  }
  const parts = c.match(/[^.!?]+[.!?]+/g);
  const norm = (x: string) => x.replace(/\s+/g, " ").trim();
  if (parts && norm(parts.join(" ")) === norm(c) && parts.some(p => SENT[p.trim()])) return parts.map(p => SENT[p.trim()] ?? p.trim()).join(" ");
  return undefined;
}

// Nunca mexe no texto da resposta, em campos de digitação nem em código.
const SKIP = ".md, textarea, input, [contenteditable], pre, code, script, style";
const skip = (el: Element | null) => !el || !!el.closest(SKIP);
// Atributos (placeholder, aria-label) de campos de digitação PODEM ser traduzidos — o que a pessoa
// digita (value/conteúdo) continua intocado.
const SKIP_ATTR = ".md, pre, code, script, style";
const skipAttr = (el: Element | null) => !el || !!el.closest(SKIP_ATTR);

function fixText(n: Text) {
  const v = n.nodeValue; const c = v && v.trim();
  if (!c || c.length > 400 || skip(n.parentElement)) return;
  const r = tr(c);
  if (r !== undefined && r !== c) n.nodeValue = v!.replace(c, () => r);
}
function fixAttr(el: Element) {
  for (const a of ["aria-label", "title", "placeholder"]) {
    const v = el.getAttribute(a); if (!v) continue;
    const r = tr(v.trim());
    if (r !== undefined && r !== v) el.setAttribute(a, r);
  }
}
// A estatística não mostra custo em dólar (o app usa créditos): some com a célula "Custo".
function polish(root: Element) {
  root.querySelectorAll("dt").forEach(dt => {
    if (/^(Cost|Custo)$/.test((dt.textContent || "").trim())) { const cell = dt.parentElement; if (cell) cell.style.display = "none"; }
  });
}
function scan(node: Node) {
  if (node.nodeType === 3) { fixText(node as Text); return; }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  if (!skipAttr(el)) { fixAttr(el); el.querySelectorAll("[aria-label],[title],[placeholder]").forEach(a => { if (!skipAttr(a)) fixAttr(a); }); }
  if (skip(el)) return;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) fixText(n as Text);
  polish(el);
}

/** Traduz a tela agora e acompanha o que aparecer depois (menus e janelas em portais incluídos).
 *  Devolve a função que desliga. Usada pelo app e pelo pacote do Claude Design (HereticV2.startPtBr). */
export function startPtBr(root: Element = document.body): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  scan(root);
  const mo = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === "characterData") fixText(m.target as Text);
      else if (m.type === "attributes") { if (!skipAttr(m.target as Element)) fixAttr(m.target as Element); }
      else m.addedNodes.forEach(scan);
    }
  });
  mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "title", "placeholder"] });
  return () => mo.disconnect();
}

/** Liga a tradução da tela (inclui menus e janelas que abrem fora do chat, em portais). */
export function usePtBrComponents() {
  useEffect(() => {
    if (lang !== "pt") return;
    return startPtBr(document.body);
  }, []);
}
