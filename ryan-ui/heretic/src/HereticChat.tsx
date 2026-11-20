// Heretic chat: desenho "Heretic - App v2" (Claude Design, aprovado 18/11) ligado ao /api/chat real.
// Moldura = HereticSidebar (o Sidebar da ryan-ui com a área principal livre): Nova conversa, Buscar,
// Imagens, histórico por dia, Configurações, cartão do plano e perfil + Suporte. Conversa em duas
// colunas: o chat (turnos do Chat Pro + a caixa de mensagem dentro da coluna) e a coluna "Fontes"
// (lista do ResearchRun) quando a resposta tem fontes. Configurações = modal (./settings).
// Conversas no localStorage; caixa de mensagem = fork do composer Pro (./composer).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { ArrowRight, Image as ImageIcon, KeyRound, LifeBuoy, Lock, MoreHorizontal, Pencil, Search, Settings as SettingsIcon, SquarePen, Trash2 } from "lucide-react";
import { motionTokens } from "@/lib/motion-tokens";
import type { ChatConversation, ChatMessage } from "@/registry/blocks/chat-app/chat-app-data";
import { Button } from "@pro/button/button";
import { Progress } from "@pro/progress/progress";
import { Card } from "@pro/card/card";
import { Input } from "@pro/input/input";
import { DropdownMenu } from "@pro/dropdown-menu/dropdown-menu";
import { CommandPalette } from "@pro/command-palette/command-palette";
import type { CommandItem } from "@pro/command-palette/command-palette";
import { Dialog, DialogContent } from "@pro/dialog/dialog";
import rr from "@pro/research-run/research-run.module.css";
import { HereticSidebar } from "./pro/heretic-sidebar";
import type { RailSection } from "./pro/heretic-sidebar";
import { Turn, estTokens } from "./turn";
import type { FeedbackEvent, TurnMessage, WebSource, PersonPhoto } from "./turn";
import { SourcesRail, SourcesStrip, railSources } from "./sources";
import { SettingsModal } from "./settings";
import { PayDialog, pendingOrderId } from "./pay";
import { UsageAvatar } from "./usage";
import { StartBurn } from "./start-plate";
import type { CfgTab } from "./settings";
import { usePtBrComponents } from "./ptbr";
import { KBD } from "./kbd";
import styles from "@/registry/blocks/chat-app/chat-app.module.css";
import { api, streamChat, getKey, setKey } from "./api";
import { LimitError, quotaMessage } from "./api";
import type { LimitTable, Msg, Quota, QuotaResource, WireAttachment } from "./api";
import { Composer, wireAttachments, withAttachments } from "./composer/ai-composer";
import type { ComposerHandle, ModelOption } from "./composer/ai-composer";
import { UsageLine } from "./composer/usage-line";
import { t } from "./i18n";

const STORE = "heretic-chats-v2";
const MAX_PROMPT_CHARS = 16000;

// A IA entende sozinha um pedido de imagem em linguagem natural (sem /imagem) e extrai a descrição.
// Retorna a descrição (string) se for imagem, ou null se for conversa normal.
const IMG_NOUN = "imagem|imagens|fotos?|fotografias?|arte|desenhos?|ilustra\\w*|logos?|logotipos?|wallpapers?|avatares?|avatar|banners?|p[ôo]ster\\w*|posters?|capas?|[íi]cones?|retratos?|pinturas?|renders?|cenas?|paisagens?|quadros?";
function imageIntent(text: string): string | null {
  const s = (text || "").trim();
  if (s.length < 5 || s.length > 600) return null;
  const verb = new RegExp(`^\\s*(por favor,?\\s*)?(ger[ae]r?|cri[ae]r?|fa[çc]a|faz|desenh[ae]r?|ilustr[ae]r?|renderiz[ae]r?|mostr[ae]r?|gostaria de (ver|uma)|quero (uma?|ver)|me (faz|cria|ger[ae]|d[áa]|desenh[ae]))\\b[\\s\\S]{0,25}?\\b(${IMG_NOUN})\\b`, "i");
  const noun = new RegExp(`^\\s*(uma?\\s+)?(${IMG_NOUN})\\b\\s+(de|do|da|com|que)\\b`, "i");
  if (!verb.test(s) && !noun.test(s)) return null;
  const m = new RegExp(`\\b(${IMG_NOUN})\\b\\s*(de|do|da|dos|das|com|:|que mostr\\w*|mostrando)?\\s*([\\s\\S]+)$`, "i").exec(s);
  const desc = m && m[3] ? m[3].trim() : s;
  return desc.length > 1 ? desc : s;
}
const MODEL_KEY = "heretic-model";
/** Used until GET /api/me answers (or if it fails). */
const FALLBACK_MODELS: ModelOption[] = [
  { id: "sao10k/l3.1-euryale-70b", name: "451 Free", short: "451 Free", note: "Sem filtro, direto e rápido", tier: "free", locked: false, provider: "openrouter", bucket: "free" },
];
const titleFrom = (prompt: string) => { const line = prompt.replace(/\s+/g, " ").trim(); return line.length > 44 ? `${line.slice(0, 43).trimEnd()}…` : line; };
// Medição anônima do funil (Vercel Web Analytics): só o NOME do evento, nunca o conteúdo da conversa.
const track = (name: string) => { try { (window as unknown as { va?: (...a: unknown[]) => void }).va?.("event", { name }); } catch { /* ignore */ } };

// Sugestões da tela inicial (tema pentest / hacking, dono 18/11): viram a pergunta na hora.
const SUGGESTIONS = ["Mapeie o sistema e aponte as brechas", "Escreva o relatório do teste de invasão", "Encontre a falha neste código"];

// Cigarra mascarada: a mesma logo, pintável (vermelha Pro / branca grátis) e com brilho cromado opcional.
const CicadaMask = ({ w, h, color, shimmer }: { w: number; h: number; color?: string; shimmer?: boolean }) =>
  <span aria-hidden="true" className={shimmer ? "hx-cicada hx-cicada-chrome" : "hx-cicada"} style={{ width: w, height: h, ...(color ? { ["--cic"]: color } : {}) } as CSSProperties} />;

// A IA raciocina dentro de <think>…</think> antes de responder (estilo Dolphin/reasoning): isso é
// OCULTO do usuário — mostramos só a resposta final. Enquanto o <think> ainda está aberto (streaming),
// retorna vazio pra manter o "pensando…".
// Corta a "delíria" do fim: modelos pequenos às vezes entram em loop e vomitam o mesmo caractere
// ("]]]]]]") ou o mesmo padrão curto repetido ("]:]:]:", "na na na"). O conteúdo bom vem antes;
// aqui jogamos o lixo fora pra resposta terminar limpa, sem despejar caractere sem sentido na tela.
function deloop(text: string): string {
  if (!text) return text;
  // 1) runs gigantes de um mesmo caractere não-espaço → reduz a 3 (preserva "---" de regra/markdown).
  let t = text.replace(/([^\s])\1{23,}/g, (_m, c: string) => c.repeat(3));
  // 2) loop de um padrão repetido no fim → mantém uma cópia e corta o resto (regex só na cauda).
  //    Pega tanto unidade CURTA repetida muito ("]:]:]") quanto unidade LONGA ciclando
  //    (ex.: "Estou com inveja. — Estou com ciúmes. — …" repetindo), que é o loop mais comum.
  const tailStart = Math.max(0, t.length - 3200);
  const head = t.slice(0, tailStart);
  const tail = t.slice(tailStart);
  const m = /([\s\S]{1,80}?)\1{4,}\s*$/.exec(tail)      // unidade curta, 5+ cópias
    || /([\s\S]{1,220}?)\1{2,}\s*$/.exec(tail);          // unidade longa (frase/lista), 3+ cópias
  if (m && typeof m.index === "number") t = head + tail.slice(0, m.index + m[1]!.length);
  return t;
}

function visibleAnswer(raw: string): string {
  let t = (raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const open = t.lastIndexOf("<think>");
  if (open !== -1 && !/<\/think>/i.test(t.slice(open))) {
    // Esconde a cauda SÓ se o <think> está logo no começo (ainda "pensando"). Um <think> solto
    // depois de já ter texto é ruído do modelo — não pode fazer a resposta inteira sumir.
    if (open <= 24) t = t.slice(0, open);
    else t = t.replace(/<\/?think>/gi, "");
  }
  return deloop(t.replace(/^\s+/, ""));
}

// Notifica "resposta pronta" só quando o usuário saiu do app (aba em segundo plano) e autorizou.
function notifyReply(text: string) {
  try {
    if (typeof document === "undefined" || !document.hidden) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const body = text.replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
    new Notification("451.sh respondeu", { body: body || "Sua resposta está pronta.", icon: "/icons/icon.svg", tag: "heretic-reply" });
  } catch { /* bloqueado / sem suporte */ }
}

// Agrupa as conversas por recência (Hoje / Ontem / Últimos 7 dias / Antigas), como no mockup.
const DAY_MS = 86400000;
const convTs = (c: ChatConversation): number => (c as ChatConversation & { ts?: number }).ts || 0;
function groupKey(ts: number): string {
  if (!ts) return "earlier";
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  if (ts >= today) return "today";
  if (ts >= today - DAY_MS) return "yesterday";
  if (ts >= today - 7 * DAY_MS) return "7d";
  return "earlier";
}
function groupLabel(key: string): string {
  return key === "today" ? "Hoje" : key === "yesterday" ? "Ontem" : key === "7d" ? "Últimos 7 dias" : "Antes";
}

// Cada turno do desenho = a pergunta + a resposta logo abaixo (a lista guarda as duas separadas).
function turnsOf(messages: ChatMessage[]): Array<{ key: string; prompt?: string; enhanced?: boolean; reply?: TurnMessage }> {
  const out: Array<{ key: string; prompt?: string; enhanced?: boolean; reply?: TurnMessage }> = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const next = messages[i + 1];
    if (m.role === "user" && next && next.role === "assistant") { out.push({ key: m.id, prompt: m.text, enhanced: (m as TurnMessage).enhanced, reply: next as unknown as TurnMessage }); i++; }
    else if (m.role === "user") out.push({ key: m.id, prompt: m.text, enhanced: (m as TurnMessage).enhanced });
    else out.push({ key: m.id, reply: m as unknown as TurnMessage });
  }
  return out;
}
// "31k de 128k": milhares redondos no medidor de contexto.
const ctxFmt = (n: number) => (n < 1000 ? String(Math.max(0, Math.round(n))) : `${Math.round(n / 1000)}k`);
// Nível de qualidade do modelo (mesma escala do seletor da caixa de mensagem).
const QLABEL = ["", t("Low"), t("Medium"), t("High"), t("Maximum")];

function load(): ChatConversation[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || "[]") as ChatConversation[];
    if (Array.isArray(list) && list.length) return list.map((c, i) => ({ ...c, ts: (c as ChatConversation & { ts?: number }).ts || Date.now() - i * 1000, messages: c.messages.map(m => (m.state === "thinking" || m.state === "streaming" ? { ...m, state: "stopped" } : m)) } as ChatConversation));
  } catch { /* fresh start */ }
  return [{ id: `chat-${Date.now()}`, title: t("New chat"), updated: t("Now"), ts: Date.now(), messages: [] } as ChatConversation];
}

// Baixar a resposta como arquivo (o usuário pediu "exporte como PDF"). Sem dependência pesada:
// o PDF sai por uma impressão de um documento limpo (claro) montado a partir do markdown já
// renderizado — preserva títulos, listas, blocos de código e até o diagrama Mermaid.
const PRINT_CSS = `*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#141414}
.doc{max-width:720px;margin:0 auto;padding:40px 36px;font:15px/1.65 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.doc-h1{font:600 24px/1.25 Georgia,"Times New Roman",serif;margin:0 0 20px;border-bottom:2px solid #F0335A;padding-bottom:10px}
.md h3,.md h4,.md h5{margin:20px 0 8px;line-height:1.3}.md p{margin:10px 0}.md ul,.md ol{margin:10px 0 10px 22px}.md li{margin:4px 0}
.md pre{background:#0d0d0f;color:#eaeaea;padding:12px 14px;border-radius:8px;overflow:auto;font:12.5px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.md code{background:#f1f1f3;color:#b11d43;padding:1px 5px;border-radius:4px;font:0.9em ui-monospace,Menlo,monospace}.md pre code{background:transparent;color:inherit;padding:0}
.md a{color:#b11d43}.md blockquote{margin:10px 0;padding:4px 14px;border-left:3px solid #F0335A;color:#555}
.md table{border-collapse:collapse;width:100%;margin:12px 0}.md th,.md td{border:1px solid #ddd;padding:6px 9px;text-align:left}.md th{background:#f6f6f7}
.hx-mermaid{background:#0b0b0d;border:1px solid #1d1d22;border-radius:10px;padding:14px;margin:12px 0;text-align:center}.hx-mermaid svg,.md svg{max-width:100%!important;height:auto!important}
.md-caret{display:none!important}
.doc-foot{margin-top:30px;padding-top:12px;border-top:1px solid #eee;color:#999;font-size:12px}
@media print{@page{margin:16mm}.doc{padding:0}}`;
function fileSlug(s: string): string {
  return (s || "heretic").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "heretic";
}
function downloadBlob(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function downloadDataUrl(name: string, dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function exportReplyPdf(sourceEl: Element | null, title: string) {
  const md = sourceEl?.querySelector(".md");
  const inner = md ? md.innerHTML : "";
  const safe = (title || "451.sh").replace(/[<>&]/g, " ");
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", opacity: "0" });
  document.body.appendChild(iframe);
  const d = iframe.contentWindow?.document;
  if (!d) { iframe.remove(); return; }
  d.open();
  d.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${safe}</title><style>${PRINT_CSS}</style></head><body><main class="doc"><h1 class="doc-h1">${safe}</h1>${inner}<footer class="doc-foot">Gerado no Heretic</footer></main></body></html>`);
  d.close();
  const go = () => { try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* bloqueado */ } setTimeout(() => iframe.remove(), 1500); };
  if (d.readyState === "complete") setTimeout(go, 350);
  else iframe.contentWindow?.addEventListener("load", () => setTimeout(go, 350));
}

export function HereticChat() {
  const reduceMotion = useReducedMotion() ?? false;
  const [conversations, setConversations] = useState<ChatConversation[]>(load);
  const [activeId, setActiveId] = useState(() => conversations[0]?.id ?? "");
  const [generating, setGenerating] = useState<{ conversationId: string; messageId: string } | null>(null);
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [plan, setPlan] = useState("free");
  // Configurações (modal): aberto, aba e se já abre com o campo da chave Pro.
  const [cfg, setCfg] = useState<{ open: boolean; tab: CfgTab; paste: boolean }>({ open: false, tab: "general", paste: false });
  // Pagamento do Pro (Pix/cripto): abre sozinho quando a pessoa volta do processador com ?pedido=.
  const [pay, setPay] = useState<{ open: boolean; orderId: string }>(() => { const id = pendingOrderId(); return { open: !!id, orderId: id }; });
  // "Assinar o Pro" só abre o pagamento quando o servidor tem Pix ou cripto ligados; sem isso, segue no campo da chave.
  const [payOn, setPayOn] = useState(false);
  useEffect(() => {
    fetch("/api/pay").then(r => (r.ok ? r.json() : null)).then(d => setPayOn(!!(d?.methods?.pix || d?.methods?.cripto))).catch(() => setPayOn(false));
  }, []);
  const [renaming, setRenaming] = useState<string | null>(null); // id da conversa sendo renomeada (janela)
  const [quality, setQuality] = useState(false);
  const [enhance, setEnhance] = useState(false); // Agente afinador: reescreve o pedido antes de enviar (Pro)
  const [paletteOpen, setPaletteOpen] = useState(false); // ⌘K / Ctrl K: busca e comandos
  const freshRef = useRef<Set<string>>(new Set()); // imagens que chegaram nesta sessão (animam ao aparecer)
  const sampleRef = useRef<{ t: number; chars: number; samples: number[] }>({ t: 0, chars: 0, samples: [] }); // velocidade do streaming
  usePtBrComponents();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Dentro das Configurações o ⌘K é a busca delas (o próprio componente cuida).
      if (e.defaultPrevented || document.querySelector(".hx-cfgmodal")) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(o => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [limitTable, setLimitTable] = useState<LimitTable | undefined>(undefined);
  // Imagens e PDFs ficam só na memória desta aba: são grandes demais para o armazenamento do aparelho.
  const attachmentsRef = useRef<Map<string, WireAttachment[]>>(new Map());
  const mergeQuotas = useCallback((next: Quota[]) => setQuotas(list => [...list.filter(q => !next.some(n => n.resource === q.resource && n.bucket === q.bucket)), ...next]), []);
  const [modelId, setModelId] = useState(() => { try { return localStorage.getItem(MODEL_KEY) ?? ""; } catch { return ""; } });
  const [wide, setWide] = useState(true); // coluna "Fontes" ao lado (senão vira faixa acima da caixa)
  const convRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const ctrl = useRef<AbortController | null>(null);
  const serverDone = useRef<Set<string>>(new Set());
  const doneTimer = useRef<number | undefined>(undefined);
  const pinned = useRef(true);
  // "Escrevendo…": revela a resposta numa cadência estável, mesmo que o servidor entregue tudo
  // de uma vez (nuclear/qualidade). targetRef = quanto já chegou; revealRef = quanto já mostramos.
  const [reveal, setReveal] = useState(0);
  const [typingId, setTypingId] = useState<string | null>(null);
  const targetRef = useRef(0);
  const revealRef = useRef(0);
  const typingDone = useRef(true);
  const rafRef = useRef<number | undefined>(undefined);
  const active = conversations.find(c => c.id === activeId) ?? conversations[0];
  const isEmpty = !active || active.messages.length === 0;
  const busy = generating !== null;
  const model = models.find(m => m.id === modelId && !m.locked) ?? models.find(m => !m.locked) ?? models[0]!;
  const bucket = model.bucket ?? "free";
  const quotaOf = (resource: QuotaResource, b = bucket) => quotas.find(q => q.resource === resource && q.bucket === b);
  const messageQuota = quotaOf("messages");
  const outOfMessages = !!messageQuota?.blocked;
  const richFiles = model.tier === "pro" && !model.locked;
  const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(conversations.slice(0, 60))); } catch { /* full */ } }, [conversations]);
  useEffect(() => () => { ctrl.current?.abort(); window.clearTimeout(doneTimer.current); if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Avança o texto revelado numa cadência que nunca atrasa mais de ~1s, com piso e teto de velocidade,
  // para parecer "escrito" sem travar o app em respostas longas despejadas de uma vez.
  const pump = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.06, (now - prev) / 1000); prev = now;
      const backlog = targetRef.current - revealRef.current;
      if (backlog > 0.5) {
        const speed = Math.min(1400, Math.max(240, backlog / 1.0)); // chars/s
        revealRef.current = Math.min(targetRef.current, revealRef.current + speed * dt);
        setReveal(Math.floor(revealRef.current));
        rafRef.current = requestAnimationFrame(tick);
      } else if (!typingDone.current) {
        rafRef.current = requestAnimationFrame(tick); // alcançou o recebido, mas ainda está chegando
      } else {
        setReveal(targetRef.current); setTypingId(null); rafRef.current = undefined; // chegou ao fim
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };
  // Começa (ou reinicia) a animação de digitação para uma resposta.
  const beginTyping = (messageId: string) => {
    targetRef.current = 0; revealRef.current = 0; typingDone.current = false;
    if (reduceMotion) { typingDone.current = true; setTypingId(null); return; }
    setReveal(0); setTypingId(messageId);
    pump();
  };
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const q = p.get("q");
    // Chegou do preset/hero da landing (?q=): envia na hora em vez de só preencher.
    if (q) { history.replaceState(null, "", location.pathname); send(q); }
    // "Entrar": só pede a chave se ainda não houver uma salva — quem já autenticou entra direto.
    if (p.get("buy") === "1" || p.get("key") === "1") { history.replaceState(null, "", location.pathname); if (!getKey()) setCfg({ open: true, tab: "security", paste: true }); }
  }, []);
  // Plan, models (Pro ones arrive locked) and today's token usage.
  const loadMe = useCallback(() => {
    api.me().then(me => {
      if (Array.isArray(me.models) && me.models.length) setModels(me.models.map(m => ({ ...m, name: m.name.replace(/^Heretic\b/, "451"), short: m.short.replace(/^Heretic\b/, "451"), badge: m.tier === "pro" ? "Pro" : undefined })));
      if (me.plan) setPlan(me.plan);
      if (Array.isArray(me.quotas)) setQuotas(me.quotas);
      setLimitTable(me.limits);
    }).catch(() => { /* keep the fallback model; the meter stays hidden */ });
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);
  // Quando a janela esgotada zera, libera a caixa de mensagem sem precisar recarregar a página.
  const blockedUntil = messageQuota?.blocked ? messageQuota.resetAt : null;
  useEffect(() => {
    if (!blockedUntil) return;
    const timer = window.setTimeout(loadMe, Math.min(Math.max(1000, blockedUntil - Date.now() + 1500), 2_000_000_000));
    return () => window.clearTimeout(timer);
  }, [blockedUntil, loadMe]);
  const applyPlan = useCallback((p: string) => { setPlan(p); loadMe(); }, [loadMe]);
  const chooseModel = (id: string) => {
    const next = models.find(m => m.id === id);
    if (!next || next.locked) return;
    setModelId(id);
    try { localStorage.setItem(MODEL_KEY, id); } catch { /* private mode */ }
  };
  // Coluna "Fontes" só cabe com a área do chat larga; abaixo disso as fontes viram faixa recolhível.
  useLayoutEffect(() => {
    const el = convRef.current;
    if (!el) return;
    const measure = () => setWide(el.clientWidth >= 880);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isEmpty]);

  const toBottom = (smooth: boolean) => { const s = scrollerRef.current; if (s) s.scrollTo({ top: s.scrollHeight, behavior: smooth && !reduceMotion ? "smooth" : "auto" }); };
  useLayoutEffect(() => { pinned.current = true; toBottom(false); }, [activeId, isEmpty]); // eslint-disable-line react-hooks/exhaustive-deps
  // Re-pin on a new message, but let the ResizeObserver do the actual scroll (instant) so a
  // smooth scroll here isn't interrupted by it — that fight caused a stutter at each reply start.
  useEffect(() => { pinned.current = true; toBottom(false); }, [active?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const observer = new ResizeObserver(() => { if (pinned.current) toBottom(false); });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [activeId, isEmpty]); // eslint-disable-line react-hooks/exhaustive-deps
  // Segue a digitação até o fim: enquanto o texto é revelado, mantém a conversa colada embaixo
  // (o usuário não precisa rolar pra ver o que a IA está escrevendo).
  useEffect(() => { if (pinned.current) toBottom(false); }, [reveal]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchMessage = (conversationId: string, messageId: string, patch: (m: ChatMessage) => ChatMessage) => {
    setConversations(list => list.map(c => c.id !== conversationId ? c : { ...c, messages: c.messages.map(m => m.id === messageId ? patch(m) : m) }));
  };
  const finish = (how: "done" | "stopped") => {
    if (!generating) return;
    window.clearTimeout(doneTimer.current);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = undefined; }
    typingDone.current = true; revealRef.current = targetRef.current; setReveal(targetRef.current); setTypingId(null);
    ctrl.current?.abort(); ctrl.current = null;
    patchMessage(generating.conversationId, generating.messageId, m => how === "done" ? { ...m, state: "done" } : { ...m, state: "stopped", text: m.state === "thinking" ? "" : m.text });
    setGenerating(null);
  };
  // Streams one reply from the server into the given assistant message.
  const run = (conversationId: string, messageId: string, history: Msg[]) => {
    serverDone.current.delete(messageId);
    setGenerating({ conversationId, messageId });
    beginTyping(messageId);
    // Medidas reais desta resposta (estatística do turno): envio, 1º token, fim do raciocínio, fim e velocidade.
    const t0 = Date.now();
    sampleRef.current = { t: 0, chars: 0, samples: [] };
    patchMessage(conversationId, messageId, m => ({ ...m, t0, inTok: estTokens(history.map(h => h.content).join("\n")), tFirst: undefined, tThink: undefined, t2: undefined, samples: undefined, search: undefined, sources: undefined, photos: undefined, steps: undefined, rating: null } as ChatMessage));
    ctrl.current = streamChat(
      { conversationId: 0, mode: "chat", model: model.id, messages: history, quality: quality && plan === "pro", enhance: enhance && plan === "pro", params: { temperature: 0.6, top_p: 0.9, max_tokens: 4096 } },
      {
        onUsage: mergeQuotas,
        // Afinador: o servidor reescreveu o pedido. Troca o texto da última bolha do usuário (anima no CSS).
        onEnhanced: (_original, text) => setConversations(list => list.map(c => {
          if (c.id !== conversationId) return c;
          const lui = [...c.messages].reverse().find(m => m.role === "user");
          return !lui ? c : { ...c, messages: c.messages.map(m => m.id === lui.id ? { ...m, text, enhanced: true } as ChatMessage : m) };
        })),
        onToken: full => {
          targetRef.current = visibleAnswer(full).length;
          const now = Date.now();
          const sm = sampleRef.current;
          if (!sm.t) { sm.t = now; sm.chars = full.length; }
          else if (now - sm.t >= 450) { sm.samples.push(Math.round(((full.length - sm.chars) / 4) / ((now - sm.t) / 1000))); if (sm.samples.length > 24) sm.samples.shift(); sm.t = now; sm.chars = full.length; }
          patchMessage(conversationId, messageId, m => {
            const mm = m as TurnMessage;
            // A busca na web termina antes do 1º token: daí em diante ela aparece como concluída.
            const search = mm.search && mm.search.status === "running" ? { ...mm.search, status: "success" as const, ms: now - (mm.search.t ?? now) } : mm.search;
            return { ...m, text: full, state: m.state === "thinking" ? "streaming" : m.state, tFirst: mm.tFirst ?? now, tThink: mm.tThink ?? (/<\/think>/i.test(full) ? now : undefined), search } as ChatMessage;
          });
        },
        // Busca na web: o servidor avisa quando começa e manda as fontes que achou.
        onWarning: data => {
          const w = data as { type?: string; query?: string; sources?: WebSource[]; images?: PersonPhoto[]; title?: string; text?: string };
          if (w.type === "search") patchMessage(conversationId, messageId, m => ({ ...m, search: { query: w.query || "", status: "running", t: Date.now() } } as ChatMessage));
          else if (w.type === "sources" && Array.isArray(w.sources)) patchMessage(conversationId, messageId, m => {
            const mm = m as TurnMessage; const now = Date.now();
            return { ...m, sources: w.sources, search: mm.search ? { ...mm.search, status: "success", ms: mm.search.ms ?? now - (mm.search.t ?? now) } : { query: "", status: "success" } } as ChatMessage;
          });
          else if (w.type === "images" && Array.isArray(w.images)) patchMessage(conversationId, messageId, m => ({ ...m, photos: w.images } as ChatMessage));
          // Modo Qualidade (arena): as duas respostas e a indicada pelo juiz; a indicada chega como resposta padrão.
          else if (w.type === "arena") {
            const a = data as { answers?: { model: string; text: string }[]; recommended?: number };
            if (Array.isArray(a.answers) && a.answers.length === 2) patchMessage(conversationId, messageId, m => ({ ...m, arena: { answers: a.answers!, recommended: a.recommended === 1 ? 1 : 0 } } as ChatMessage));
          }
          else if (w.type === "step" && w.title) patchMessage(conversationId, messageId, m => {
            const prev = (m as TurnMessage).steps ?? [];
            return { ...m, steps: [...prev, { title: String(w.title), text: String(w.text ?? "") }] } as ChatMessage;
          });
        },
        // FORÇA TUDO: o servidor descartou uma recusa e re-rodou o modelo → limpa e volta ao "pensando".
        onRefusalForced: () => { targetRef.current = 0; revealRef.current = 0; setReveal(0); patchMessage(conversationId, messageId, m => ({ ...m, text: "", state: "thinking", tFirst: undefined, tThink: undefined } as ChatMessage)); },
        onError: (message, info) => {
          window.clearTimeout(doneTimer.current);
          typingDone.current = true; setTypingId(null); if (rafRef.current) cancelAnimationFrame(rafRef.current);
          // Refusals before streaming (429 out of tokens, 403 Pro model) already carry a readable message.
          const text = info ? message : message === "Daily limit reached" ? t("You've hit today's message limit.") : `${t("Something went wrong: ")}${message}`;
          patchMessage(conversationId, messageId, m => ({ ...m, state: "done", text }));
          setGenerating(null); ctrl.current = null;
          if (info?.status === 403) loadMe();
        },
        onDone: content => {
          serverDone.current.add(messageId);
          window.clearTimeout(doneTimer.current);
          const finalText = content || "";
          targetRef.current = visibleAnswer(finalText).length; typingDone.current = true;
          if (reduceMotion && rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = undefined; setReveal(targetRef.current); setTypingId(null); }
          else if (!rafRef.current && !reduceMotion) pump(); // garante que a digitação termine mesmo que o stream chegue tudo no 'done'
          const tEnd = Date.now(); const samples = sampleRef.current.samples.slice();
          patchMessage(conversationId, messageId, m => {
            const mm = m as TurnMessage;
            const search = mm.search && mm.search.status === "running" ? { ...mm.search, status: "success" as const, ms: tEnd - (mm.search.t ?? tEnd) } : mm.search;
            return { ...m, text: finalText || m.text, state: "done", t2: tEnd, samples, search } as ChatMessage;
          });
          setGenerating(g => (g && g.messageId === messageId ? null : g)); ctrl.current = null;
          notifyReply(visibleAnswer(content || ""));
        },
      },
    );
  };
  // Reenvia os anexos da conversa, do mais novo ao mais antigo, até o teto de tamanho de um pedido.
  const historyOf = (messages: ChatMessage[]): Msg[] => {
    let room = 3_400_000;
    const list = messages.filter(m => m.text && m.state !== "thinking");
    const withFiles = new Map<string, WireAttachment[]>();
    if (richFiles) for (const m of [...list].reverse()) {
      const files = attachmentsRef.current.get(m.id);
      const size = files?.reduce((sum, f) => sum + f.data.length, 0) ?? 0;
      if (files && size <= room) { withFiles.set(m.id, files); room -= size; }
    }
    return list.map(m => ({ role: m.role, content: m.text, ...(withFiles.has(m.id) ? { attachments: withFiles.get(m.id) } : {}) }));
  };

  // Ferramenta: gera uma imagem (Venice) e devolve como mensagem do assistente.
  const generateImage = (conversationId: string, messageId: string, imgPrompt: string) => {
    setGenerating({ conversationId, messageId });
    api.image(imgPrompt)
      .then(res => {
        if (res.quotas) mergeQuotas(res.quotas);
        freshRef.current.add(messageId); // chegou agora: aparece do ruído até ficar nítida
        patchMessage(conversationId, messageId, m => ({ ...m, state: "done", text: imgPrompt, image: res.image } as ChatMessage));
        setGenerating(g => (g && g.messageId === messageId ? null : g));
        if (typeof document !== "undefined" && document.hidden) notifyReply(t("Your image is ready."));
      })
      .catch(err => {
        const limit = err instanceof LimitError ? err.quota : null;
        if (limit) mergeQuotas([limit]);
        const text = limit ? quotaMessage(limit) : t("Couldn't generate the image. Try again.");
        patchMessage(conversationId, messageId, m => ({ ...m, state: "done", text }));
        setGenerating(g => (g && g.messageId === messageId ? null : g));
      });
  };

  const send = (text: string, title?: string, files: WireAttachment[] = []) => {
    const typed = text.trim() || (files.length ? "Analise o anexo." : "");
    const prompt = files.length ? `${typed}\n\n${files.map(f => `📎 ${f.name}`).join("\n")}` : typed;
    if (!prompt || busy || !active || outOfMessages) return;
    track("pergunta_enviada");
    // Pede permissão de notificação no gesto de enviar (pra avisar quando a resposta ficar pronta).
    try { if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); } catch { /* ignore */ }
    // Imagem: comando /imagem <descrição> OU pedido em linguagem natural ("gere uma imagem de...").
    const cmd = /^\/(?:imagem|image|img)\s+([\s\S]+)/i.exec(prompt);
    const imgDesc = files.length ? null : cmd ? cmd[1]!.trim() : imageIntent(prompt); // string = imagem; null = conversa
    const userText = cmd ? cmd[1]!.trim() : prompt; // natural: mostra o que a pessoa escreveu
    const userMsg: ChatMessage = { id: nextId("prompt"), role: "user", text: userText, state: "done" };
    if (files.length) attachmentsRef.current.set(userMsg.id, files);
    const replyId = nextId("reply");
    const before = active.messages;
    setConversations(list => list.map(c => c.id !== active.id ? c : { ...c, title: c.messages.length === 0 ? titleFrom(cmd ? userText : title || userText) : c.title, updated: "Now", ts: Date.now(), messages: [...c.messages, userMsg, { id: replyId, role: "assistant", text: "", state: "thinking", model: imgDesc ? t("Image") : model.short } as ChatMessage] } as ChatConversation));
    if (imgDesc) generateImage(active.id, replyId, imgDesc);
    else run(active.id, replyId, historyOf([...before, userMsg]));
  };
  const regenerate = () => {
    if (busy || !active || outOfMessages) return;
    const last = active.messages[active.messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const lastMeta = last as TurnMessage;
    // Imagem: gera de novo a partir da mesma descrição (não vira resposta de texto).
    if (lastMeta.image || lastMeta.model === t("Image")) {
      const desc = last.text;
      patchMessage(active.id, last.id, m => ({ ...m, state: "thinking", image: undefined } as ChatMessage));
      generateImage(active.id, last.id, desc);
      return;
    }
    patchMessage(active.id, last.id, m => ({ ...m, text: "", state: "thinking" }));
    run(active.id, last.id, historyOf(active.messages.slice(0, -1)));
  };
  // 👍/👎: a nota fica na conversa (no aparelho) e só o tipo da nota entra na medição anônima.
  const rateReply = (conversationId: string, messageId: string, e: FeedbackEvent) => {
    patchMessage(conversationId, messageId, m => ({ ...m, rating: e.rating, reasons: e.reasons } as ChatMessage));
    if (e.stage === "rating" && e.rating) track(e.rating === "up" ? "resposta_boa" : "resposta_ruim");
  };
  // ⌘K: as ações, os modelos e as conversas recentes num lugar só.
  const sortedChats = [...conversations].sort((a, b) => convTs(b) - convTs(a));
  const paletteItems: CommandItem[] = [
    { id: "new", label: t("New chat"), group: t("Actions"), icon: <SquarePen size={16} aria-hidden="true" />, keywords: ["nova", "new", "conversa"] },
    { id: "image", label: t("Generate an image"), group: t("Actions"), icon: <ImageIcon size={16} aria-hidden="true" />, keywords: ["imagem", "image", "foto"] },
    { id: "key", label: plan === "pro" ? "Chave Pro" : "Colar chave Pro", group: t("Actions"), icon: plan === "pro" ? <KeyRound size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />, keywords: ["pro", "chave", "key"] },
    { id: "settings", label: t("Settings"), group: t("Actions"), icon: <SettingsIcon size={16} aria-hidden="true" />, keywords: ["config"] },
    ...models.map(m => ({
      id: `model:${m.id}`, label: m.name, group: t("Models"),
      description: [m.quality ? QLABEL[m.quality] : "", m.locked ? "Pro" : m.id === model.id ? t("In use") : ""].filter(Boolean).join(" · "),
      keywords: [m.short, "modelo", "model"],
    })),
    ...sortedChats.filter(c => c.messages.length > 0).slice(0, 8).map(c => ({ id: `chat:${c.id}`, label: c.title, group: t("Chats"), keywords: ["conversa", "chat"] })),
  ];
  const runCommand = (item: CommandItem) => {
    setPaletteOpen(false);
    if (item.id === "new") newChat();
    else if (item.id === "image") startImage();
    else if (item.id === "key") openCfg("security", plan !== "pro");
    else if (item.id === "settings") openCfg("general");
    else if (item.id.startsWith("model:")) chooseModel(item.id.slice(6));
    else if (item.id.startsWith("chat:")) select(item.id.slice(5));
  };
  const select = (id: string) => { if (id !== activeId) finish("done"); setActiveId(id); };
  const newChat = () => {
    finish("done");
    const empty = conversations.find(c => c.messages.length === 0);
    if (empty) setActiveId(empty.id);
    else { const id = nextId("chat"); setConversations(list => [{ id, title: t("New chat"), updated: t("Now"), ts: Date.now(), messages: [] } as ChatConversation, ...list]); setActiveId(id); }
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };
  // Renomear / excluir conversa (recursos padrão de qualquer chat).
  const renameConversation = (id: string, title: string) => {
    const name = title.trim();
    setRenaming(null);
    if (!name) return;
    setConversations(list => list.map(c => c.id === id ? { ...c, title: name } : c));
  };
  const deleteConversation = (id: string) => {
    if (generating?.conversationId === id) finish("stopped");
    const remaining = conversations.filter(c => c.id !== id);
    if (remaining.length === 0) {
      const nid = nextId("chat");
      setConversations([{ id: nid, title: t("New chat"), updated: t("Now"), ts: Date.now(), messages: [] } as ChatConversation]);
      setActiveId(nid);
    } else {
      if (activeId === id) setActiveId(remaining[0]!.id);
      setConversations(remaining);
    }
  };

  // Configurações em modal. No celular o menu é uma folha: espera ela fechar antes de abrir outra janela.
  const afterSheet = (fn: () => void) => window.setTimeout(fn, typeof window !== "undefined" && window.innerWidth < 520 ? 260 : 0);
  const openCfg = (tab: CfgTab, paste = false) => afterSheet(() => setCfg({ open: true, tab, paste }));
  const startImage = () => { newChat(); window.setTimeout(() => { composerRef.current?.fill("/imagem "); composerRef.current?.focus(); }, 30); };
  // Segurança: apagar as conversas deste aparelho / sair (tira a chave, as conversas e o modelo escolhido).
  const deleteAll = () => {
    if (generating) finish("stopped");
    const nid = nextId("chat");
    setConversations([{ id: nid, title: t("New chat"), updated: t("Now"), ts: Date.now(), messages: [] } as ChatConversation]);
    setActiveId(nid);
  };
  const signOut = () => {
    deleteAll();
    setKey("");
    try { localStorage.removeItem(MODEL_KEY); } catch { /* private mode */ }
    setModelId(""); setQuality(false); setPlan("free"); loadMe();
    window.setTimeout(() => setCfg(c => ({ ...c, open: false })), 700);
  };
  const withMsgs = conversations.filter(c => c.messages.length > 0);
  const stats = {
    conversations: withMsgs.length,
    messages: withMsgs.reduce((n, c) => n + c.messages.filter(m => m.role === "user").length, 0),
    images: withMsgs.reduce((n, c) => n + c.messages.filter(m => !!(m as TurnMessage).image).length, 0),
    since: null,
  };

  // Menu lateral: ações, histórico por dia e Configurações (ids das conversas com prefixo "chat:").
  const groups: RailSection[] = [];
  for (const c of sortedChats) {
    if (!c.messages.length) continue;
    const key = groupKey(convTs(c));
    let g = groups.find(x => x.id === key);
    if (!g) { g = { id: key, heading: groupLabel(key), items: [] }; groups.push(g); }
    g.items.push({ id: `chat:${c.id}`, label: c.title });
  }
  const sections: RailSection[] = [
    { id: "acoes", items: [
      { id: "nova", label: "Nova conversa", icon: SquarePen },
      { id: "buscar", label: "Buscar", icon: Search, count: KBD },
      { id: "imagens", label: "Imagens", icon: ImageIcon },
    ] },
    ...groups,
  ];
  const navActive = !isEmpty && active ? `chat:${active.id}` : "nova";
  const onNav = (id: string) => {
    if (id === "nova") newChat();
    else if (id === "buscar") afterSheet(() => setPaletteOpen(true));
    else if (id === "imagens") startImage();
    else if (id === "config") openCfg("general");
    else if (id.startsWith("chat:")) select(id.slice(5));
  };
  const titleOf = (id: string) => id === "nova" ? "Nova conversa" : id === "buscar" ? "Buscar" : id === "imagens" ? "Imagens" : id === "config" ? "Configurações"
    : id.startsWith("chat:") ? (conversations.find(c => c.id === id.slice(5))?.title ?? "451.sh") : "451.sh";
  const pro = plan === "pro";

  const pop: Transition = reduceMotion ? { duration: 0 } : motionTokens.spring.gentle;
  const lastMessage = active?.messages[active.messages.length - 1];
  // Medidor de contexto do topo: tamanho da conversa (estimado como no servidor) sobre a janela do modelo.
  const ctxMax = (model as ModelOption & { ctx?: number | null }).ctx || 0;
  const ctxUsed = active ? estTokens(active.messages.map(m => m.text).join("\n")) : 0;
  const ctx = ctxMax ? { used: Math.min(ctxUsed, ctxMax), max: ctxMax, label: `${ctxFmt(ctxUsed)} ${t("of")} ${ctxFmt(ctxMax)}` } : null;
  // Cartão do plano (grátis): quantas mensagens ainda cabem agora, de verdade (/api/me).
  const messagesLeft = messageQuota ? messageQuota.remaining : null;

  // Fontes: as da última resposta que trouxe fontes (coluna à direita; no celular, faixa acima da caixa).
  const msgs = active?.messages ?? [];
  let srcAt = -1;
  for (let i = msgs.length - 1; i >= 0; i--) { if (((msgs[i] as TurnMessage).sources ?? []).length) { srcAt = i; break; } }
  const srcMsg = srcAt >= 0 ? (msgs[srcAt] as TurnMessage) : null;
  const rail = railSources(srcMsg?.sources);
  const railQuestion = srcAt > 0 && turnsOf(msgs).length > 1 ? msgs[srcAt - 1]?.text : undefined;

  const composer = (
    <Composer
      ref={composerRef}
      models={models}
      model={model}
      onModel={chooseModel}
      onLockedModel={() => openCfg("billing")}
      busy={busy}
      progress={null}
      placeholder={isEmpty ? "Manda o alvo. Nada aqui pede licença" : "Próximo alvo. Manda"}
      maxLength={MAX_PROMPT_CHARS}
      reduced={reduceMotion}
      blocked={outOfMessages && messageQuota ? quotaMessage(messageQuota) : null}
      richFiles={richFiles}
      attachLeft={{ images: quotaOf("image_upload")?.remaining ?? 0, files: quotaOf("files")?.remaining ?? 0 }}
      onSubmit={payload => send(withAttachments(payload), payload.text || payload.attachments[0]?.name, wireAttachments(payload))}
      onStop={() => finish("stopped")}
      quality={quality}
      onQuality={() => setQuality(q => !q)}
      qualityAvailable={pro}
      enhance={enhance}
      onEnhance={() => setEnhance(e => !e)}
      enhanceAvailable={pro}
    />
  );
  const usageLine = messageQuota ? <UsageLine quota={messageQuota} /> : null;

  const topbarEnd = (
    <span className="hx-topend">
      {ctx && wide && !isEmpty ? (
        <span className="hx-ctx" role="group" aria-label={`Contexto da conversa: ${ctx.label}`}>
          <span className="hx-ctxbar"><Progress value={ctx.used} max={ctx.max} /></span>
          <span className="hx-ctxtxt" aria-hidden="true">{ctx.label}</span>
        </span>
      ) : null}
      {!isEmpty && active ? (
        <span className="hx-convopts">
          <DropdownMenu label="Opções" icon={<MoreHorizontal size={16} aria-hidden="true" />} items={[
            { label: "Renomear", icon: <Pencil size={14} aria-hidden="true" />, onSelect: () => setRenaming(active.id) },
            { label: "Excluir conversa", icon: <Trash2 size={14} aria-hidden="true" />, destructive: true, separatorBefore: true, onSelect: () => deleteConversation(active.id) },
          ]} />
        </span>
      ) : null}
    </span>
  );

  const planCard = pro ? null : (
    <Card className="hx-plancard" title="Plano grátis"
      description={messagesLeft !== null ? `${messagesLeft.toLocaleString("pt-BR")} mensagens livres agora` : "Mensagens grátis todo dia"}
      action={<Button variant="primary" size="sm" className="hx-plancta" onClick={() => openCfg("billing")}>Assinar o Pro</Button>} />
  );

  const renamingConv = renaming ? conversations.find(c => c.id === renaming) : undefined;

  return (
    <div className="hx-chat hx-app" data-pro={pro ? "" : undefined}>
      <HereticSidebar
        className="hx-shell"
        label="451.sh"
        crumbRoot="451.sh"
        brand={{ name: "451.sh", wordmark: <span className="hx-wm" aria-label="451.sh"><span className="hx-wm-n" aria-hidden="true">451</span><span className="hx-wm-s" aria-hidden="true">.sh</span></span>, href: "/", hrefLabel: "451.sh, voltar para a página inicial", mark: <CicadaMask w={28} h={12} color="#E8E2D0" /> }}
        profile={{
          name: "Anônimo",
          sub: pro ? "Pro" : "Plano grátis",
          // Anel e cartão "Uso" (o que resta de mensagens em cada modelo liberado).
          avatar: <UsageAvatar quotas={quotas} names={Object.fromEntries(models.filter(m => !m.locked).map(m => [m.bucket ?? "free", m.short]).reverse())}><span className="hx-avatar-cic hx-railavatar" aria-hidden="true"><CicadaMask w={26} h={9} color={pro ? "#F0335A" : "#F5F5F7"} /></span></UsageAvatar>,
          trailing: <Button variant="ghost" size="sm" className="hx-supportbtn" onClick={() => openCfg("support")}><LifeBuoy size={15} strokeWidth={1.75} aria-hidden="true" />Suporte</Button>,
        }}
        sections={sections}
        settings={{ id: "config", label: "Configurações", icon: SettingsIcon }}
        footer={planCard}
        active={navActive}
        onSelect={onNav}
        title={titleOf}
        topbarEnd={topbarEnd}
      >
        <div ref={convRef} className="hx-conv" data-empty={isEmpty ? "" : undefined} data-rail={wide && !isEmpty && rail.length ? "" : undefined}>
          <section className="hx-col" aria-label={active && !isEmpty ? active.title : "Nova conversa"}>
            {isEmpty ? (
              <div className="hx-start hx-start-burn">
                {/* Início "C · 451 queimando" (start-plate.tsx; StartCenter e StartPlate ficam como alternativas). */}
                <StartBurn
                  suggestions={SUGGESTIONS}
                  onPick={q => send(q)}
                  go={<ArrowRight className="hx-burn-go" aria-hidden="true" />}
                  composer={<>{composer}{usageLine}</>}
                />
              </div>
            ) : (
              <>
                <div ref={scrollerRef} className="hx-scroll" onScroll={event => { const n = event.currentTarget; pinned.current = n.scrollHeight - n.scrollTop - n.clientHeight < 56; }}>
                  <motion.div key={active?.id} ref={threadRef} className={`${styles.thread} hx-thread`} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.standard] as [number, number, number, number] }}>
                    <ol className={`${styles.messages} hx-turns`} aria-label={t("Messages")}>
                      <AnimatePresence initial={false}>
                        {turnsOf(msgs).map(tn => {
                          const r = tn.reply;
                          const full = r && !r.image ? visibleAnswer(r.text) : "";
                          const typing = !!r && r.id === typingId && !reduceMotion;
                          const shown = typing ? full.slice(0, reveal) : full;
                          const caret = !!r && (r.state === "streaming" || (typing && reveal < full.length));
                          const convId = active?.id ?? "";
                          return (
                            <motion.li key={tn.key} className="hx-turnli" initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={pop}>
                              <Turn
                                prompt={tn.prompt}
                                enhanced={tn.enhanced}
                                reply={r}
                                shown={shown}
                                caret={caret}
                                fresh={!!r && freshRef.current.has(r.id)}
                                canRegenerate={!!r && r.id === lastMessage?.id && !busy}
                                busy={busy}
                                onRegenerate={regenerate}
                                onFeedback={e => { if (r) rateReply(convId, r.id, e); }}
                                onPdf={el => exportReplyPdf(el, active?.title || "451.sh")}
                                onMd={text => downloadBlob(`${fileSlug(active?.title || "heretic")}.md`, text, "text/markdown;charset=utf-8")}
                                onImage={(src, name) => downloadDataUrl(`${fileSlug(name)}.webp`, src)}
                                onOption={v => send(v)}
                                hideSources={!!r && r.id === srcMsg?.id}
                                arenaName={(id, i) => models.find(m => m.id === id)?.short ?? (i === 0 ? "Resposta 1" : "Desafiante")}
                                onArenaPick={i => {
                                  if (!r?.arena) return;
                                  const pick = r.arena.answers[i];
                                  if (pick) patchMessage(convId, r.id, m => ({ ...m, text: pick.text, arena: { ...r.arena!, chosen: i } } as ChatMessage));
                                }}
                              />
                            </motion.li>
                          );
                        })}
                      </AnimatePresence>
                    </ol>
                  </motion.div>
                </div>
                <div className="hx-dock">
                  {!wide && rail.length ? <SourcesStrip key={srcMsg?.id} sources={rail} /> : null}
                  {composer}
                  {usageLine}
                </div>
              </>
            )}
            <span className={styles.srOnly} role="status">{busy ? t("Heretic is replying") : ""}</span>
          </section>
          {wide && !isEmpty && rail.length ? <SourcesRail key={srcMsg?.id} sources={rail} question={railQuestion} /> : null}
        </div>
      </HereticSidebar>

      <PayDialog open={pay.open} orderId={pay.orderId} onOpenChange={open => setPay(p => ({ open, orderId: open ? p.orderId : "" }))} onPaid={loadMe} />
      <SettingsModal
        onSubscribe={payOn ? () => { setCfg(c => ({ ...c, open: false })); setPay({ open: true, orderId: "" }); } : undefined}
        open={cfg.open}
        onOpenChange={open => setCfg(c => ({ ...c, open, paste: open ? c.paste : false }))}
        tab={cfg.tab}
        onTab={tab => setCfg(c => ({ ...c, tab }))}
        pasteKey={cfg.paste}
        plan={plan}
        quotas={quotas}
        limits={limitTable}
        models={models}
        model={model}
        onModel={chooseModel}
        onPlan={applyPlan}
        stats={stats}
        onDeleteAll={deleteAll}
        onSignOut={signOut}
      />
      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent title={t("Search and commands")} className="hx-palette">
          <CommandPalette items={paletteItems} placeholder={t("Search chats, models and actions")} autoFocus onSelect={runCommand} onClose={() => setPaletteOpen(false)} label={t("Search and commands")} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!renamingConv} onOpenChange={open => { if (!open) setRenaming(null); }}>
        <DialogContent title="Renomear conversa" className="hx-rename">
          <form className="hx-rename-form" onSubmit={e => { e.preventDefault(); const v = new FormData(e.currentTarget).get("nome"); if (renamingConv) renameConversation(renamingConv.id, String(v ?? "")); }}>
            <Input label="Nome" name="nome" defaultValue={renamingConv?.title ?? ""} autoFocus maxLength={80} />
            <span className="hx-rename-actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(null)}>Cancelar</Button>
              <Button type="submit" variant="primary" size="sm">Salvar</Button>
            </span>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
