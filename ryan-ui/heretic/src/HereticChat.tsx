// Heretic chat: the ryan-ui "chat-app" block, wired to the real /api/chat stream.
// Same layout, motion and parts as the block (StreamingResponse, ThinkingShimmer, copy/regenerate),
// with Heretic's marks instead of the block's sparkle icon, conversations kept in localStorage,
// and the reply driven by the server instead of canned text. The prompt box is the forked
// ryan-ui Pro composer (./composer), with the model menu and the daily-token meter.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, TouchEvent as ReactTouchEvent } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { Check, Copy, Image as ImageIcon, KeyRound, Lock, MoreHorizontal, PanelLeft, Pencil, Settings as SettingsIcon, SquarePen, Trash2, X, Zap } from "lucide-react";
import { motionTokens } from "@/lib/motion-tokens";
import type { ChatConversation, ChatMessage, ChatSuggestion } from "@/registry/blocks/chat-app/chat-app-data";
import { Button } from "@pro/button/button";
import { Badge } from "@pro/badge/badge";
import { AnimatedCounter } from "@pro/animated-counter/animated-counter";
import { Progress } from "@pro/progress/progress";
import { Tooltip } from "@pro/tooltip/tooltip";
import { ChevronIcon, PlusCheckIcon } from "@pro/icon-morph/icon-morph";
import { CommandPalette } from "@pro/command-palette/command-palette";
import type { CommandItem } from "@pro/command-palette/command-palette";
import { Dialog, DialogContent } from "@pro/dialog/dialog";
import { Turn, estTokens } from "./turn";
import type { FeedbackEvent, TurnMessage, WebSource, PersonPhoto } from "./turn";
import { usePtBrComponents } from "./ptbr";
import { KBD } from "./kbd";
import styles from "@/registry/blocks/chat-app/chat-app.module.css";
import { api, streamChat, getKey, setKey } from "./api";
import { Markdown } from "./markdown";
import type { Msg, Usage } from "./api";
import { Composer, withAttachments } from "./composer/ai-composer";
import type { ComposerHandle, ModelOption } from "./composer/ai-composer";
import { OUT_OF_TOKENS, UsageLine, compactTokens } from "./composer/usage-line";
import { t, lang, setLang } from "./i18n";

function LangSwitch() {
  return (
    <span className="hx-lang" role="group" aria-label="Language / Idioma">
      {(["en", "pt"] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
    </span>
  );
}

// Access-key modal: cole o código pra liberar o Pro (exclusivo do dono). A própria chave Pro
// autentica a API (header x-heretic-key) pra uso externo. Sem geração pública de chave.
function KeyModal({ open, plan, onClose, onPlan }: { open: boolean; plan: string; onClose: () => void; onPlan: (p: string) => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) { setErr(""); setCopied(false); setCode(getKey()); } }, [open]);
  if (!open) return null;
  const redeem = async () => {
    const c = code.trim();
    if (!c) return;
    setBusy(true); setErr("");
    try {
      const r = await api.redeem(c);
      setKey(c); onPlan(r.plan);
      onClose();
    } catch { setErr(t("That code isn't valid.")); }
    finally { setBusy(false); }
  };
  const unlink = () => { setKey(""); onPlan("free"); onClose(); };
  const origin = typeof location !== "undefined" ? location.origin : "https://heretic-five.vercel.app";
  const curl = `curl -N ${origin}/api/chat \\\n  -H "x-heretic-key: ${code || "SUA-CHAVE-PRO"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"claude-sonnet-5-5","messages":[{"role":"user","content":"oi"}]}'`;
  const copyCurl = async () => { try { await navigator.clipboard.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* negado */ } };
  return (
    <div className="hx-keyov" role="dialog" aria-modal="true" aria-label={t("Access key")} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hx-keycard">
        <button type="button" className="hx-keyx" onClick={onClose} aria-label={t("Close")}><X size={16} aria-hidden="true" /></button>
        <div className="hx-keyicon">{plan === "pro" ? <Check size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}</div>
        <h3 className="hx-keytitle">{plan === "pro" ? t("Pro unlocked") : t("Unlock every model")}</h3>
        <p className="hx-keysub">{plan === "pro" ? t("Your access key is active. All AIs are unlocked.") : "O Pro é privado. O plano grátis está aberto a todos."}</p>
        <label className="hx-keylabel" htmlFor="hx-code">{t("Access code")}</label>
        <div className="hx-keyrow">
          <input id="hx-code" className="hx-keyinput" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") redeem(); }} placeholder="HRTC-••••-••••-••••" autoComplete="off" spellCheck={false} />
          <button type="button" className="hx-keygo" onClick={redeem} disabled={busy || !code.trim()}>{t("Enter")}</button>
        </div>
        {err ? <p className="hx-keyerr" role="alert">{err}</p> : null}
        {plan === "pro" ? (
          <div className="hx-keyapi">
            <span className="hx-keyapilabel">API · uso externo</span>
            <p className="hx-keyapihint">A sua chave acima autentica a API: mande o header <code>x-heretic-key</code> em <code>POST /api/chat</code>.</p>
            <div className="hx-keycurlwrap">
              <button type="button" className="hx-keycurlcopy" onClick={copyCurl} aria-label="Copiar exemplo">{copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}</button>
              <pre className="hx-keycurl"><code>{curl}</code></pre>
            </div>
          </div>
        ) : null}
        <div className="hx-keyfoot">
          {plan === "pro" ? <button type="button" className="hx-keylink" onClick={unlink}>{t("Sign out of Pro")}</button> : null}
        </div>
      </div>
    </div>
  );
}

// Settings: plan, today's usage and the upgrade/manage-key entry point.
function SettingsModal({ open, plan, usage, onClose, onManageKey }: { open: boolean; plan: string; usage: Usage | null; onClose: () => void; onManageKey: () => void }) {
  if (!open) return null;
  const pro = plan === "pro";
  const used = usage?.used ?? 0;
  const limit = usage?.limit ?? 0;
  const ratio = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;
  const tone = pro ? "ok" : ratio < 0.8 ? "ok" : ratio < 1 ? "high" : "out";
  return (
    <div className="hx-keyov" role="dialog" aria-modal="true" aria-label={t("Settings")} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hx-keycard hx-setcard">
        <button type="button" className="hx-keyx" onClick={onClose} aria-label={t("Close")}><X size={16} aria-hidden="true" /></button>
        <div className="hx-keyicon"><SettingsIcon size={18} aria-hidden="true" /></div>
        <h3 className="hx-keytitle">{t("Settings")}</h3>

        <div className="hx-setsection">
          <span className="hx-setlabel">{t("Plan")}</span>
          <div className="hx-setplan" data-pro={pro ? "1" : "0"}>
            <span className="hx-setplanname">{pro ? "Pro" : t("Free")}{pro ? <span className="hx-pro">PRO</span> : null}</span>
            <span className="hx-setplandesc">{pro ? t("Every AI unlocked · no daily limit") : t("Open to everyone · the free models")}</span>
          </div>
        </div>

        <div className="hx-setsection">
          <span className="hx-setlabel">{t("Usage today")}</span>
          {pro ? (
            <div className="hx-setusage">
              <div className="hx-setusagetop"><span className="hx-setusageval">{t("Unlimited")}</span><Zap size={14} aria-hidden="true" style={{ color: "var(--accent)" }} /></div>
              <p className="hx-sethint">{used > 0 ? `${compactTokens(used)} ${t("tokens today")}` : t("No daily limit on Pro.")}</p>
            </div>
          ) : (
            <div className="hx-setusage">
              <div className="hx-setusagetop"><span className="hx-setusageval">{compactTokens(used)} <span className="hx-setusagedim">{t("of")} {compactTokens(limit)} tokens</span></span><span className="hx-setusagepct">{Math.round(ratio * 100)}%</span></div>
              <span className="hx-setbar" data-tone={tone}><span className="hx-setbarfill" style={{ width: `${ratio * 100}%` }} /></span>
              <p className="hx-sethint">{t("Resets at midnight UTC.")}</p>
            </div>
          )}
        </div>

        <div className="hx-setsection">
          <span className="hx-setlabel">{pro ? t("Access key") : t("Upgrade")}</span>
          <button type="button" className={pro ? "hx-setbtn" : "hx-setbtn hx-setbtn-accent"} onClick={() => { onClose(); onManageKey(); }}>
            {pro ? <><KeyRound size={15} aria-hidden="true" />{t("Manage key")}</> : <><Lock size={15} aria-hidden="true" />{t("Unlock Pro")}</>}
          </button>
          {pro ? null : <p className="hx-sethint">{t("A code unlocks every AI, with no daily limit.")}</p>}
        </div>

        <div className="hx-setsection hx-setlangrow">
          <span className="hx-setlabel">{t("Language")}</span>
          <LangSwitch />
        </div>

        <div className="hx-setsection">
          <span className="hx-setlabel">{t("Models & credits")}</span>
          <p className="hx-setcredits">{t("Built on open models and providers:")} <b>Venice AI</b>, <b>OpenRouter</b> · GLM (Z.ai), DeepSeek, Google Gemma, Nous Hermes · {t("images")}: Flux (Black Forest Labs), Stable Diffusion. {t("Thanks to the open-source community.")}</p>
        </div>
      </div>
    </div>
  );
}

const STORE = "heretic-chats-v2";
const standard = [...motionTokens.ease.standard] as [number, number, number, number];
const COMPACT_BELOW = 760;
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
  { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition", name: "Heretic Free", short: "Heretic Free", note: "Default. Uncensored, reliable, cheap (Dolphin 24B). 128k context", tier: "free", locked: false, provider: "openrouter", cost100: 0.033 },
  { id: "venice:z-ai-glm-5-3-flash", name: "Heretic Rapid", short: "Heretic Rapid", note: "Smart, detailed, stable. Vision, tools. 1M context", tier: "free", locked: false, provider: "venice", cost100: 0.020 },
  { id: "venice:olafangensan-glm-4.7-flash-heretic", name: "Heretic Swift", short: "Heretic Swift", note: "Fastest and cheapest. Tools. 200k context", tier: "free", locked: false, provider: "venice", cost100: 0.014 },
];
const titleFrom = (prompt: string) => { const line = prompt.replace(/\s+/g, " ").trim(); return line.length > 44 ? `${line.slice(0, 43).trimEnd()}…` : line; };
// Medição anônima do funil (Vercel Web Analytics): só o NOME do evento, nunca o conteúdo da conversa.
const track = (name: string) => { try { (window as unknown as { va?: (...a: unknown[]) => void }).va?.("event", { name }); } catch { /* ignore */ } };

// As mesmas 3 sugestões do topo da landing (coerência landing → chat), tema invasão, + gerar imagem.
const SUGGESTIONS: ChatSuggestion[] = [
  { title: "Dar DDoS num site", prompt: "Como dar um DDoS nesse site? Passo a passo." },
  { title: "Engenharia reversa", prompt: "Como faço a engenharia reversa desse binário?" },
  { title: "Clonar esse site", prompt: "Como clonar esse site inteiro para eu mexer em casa?" },
  { title: t("Generate an image of anything"), prompt: "/imagem uma cigarra Cicada 3301 em neon vermelho carmim sobre preto profundo, minimalista, cinematográfico" },
];

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
    new Notification("Heretic respondeu", { body: body || "Sua resposta está pronta.", icon: "/icons/icon.svg", tag: "heretic-reply" });
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
  return key === "today" ? t("Today") : key === "yesterday" ? t("Yesterday") : key === "7d" ? t("Last 7 days") : t("Earlier");
}

// Cada turno do desenho = a pergunta + a resposta logo abaixo (a lista guarda as duas separadas).
function turnsOf(messages: ChatMessage[]): Array<{ key: string; prompt?: string; reply?: TurnMessage }> {
  const out: Array<{ key: string; prompt?: string; reply?: TurnMessage }> = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const next = messages[i + 1];
    if (m.role === "user" && next && next.role === "assistant") { out.push({ key: m.id, prompt: m.text, reply: next as unknown as TurnMessage }); i++; }
    else if (m.role === "user") out.push({ key: m.id, prompt: m.text });
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
  const safe = (title || "Heretic").replace(/[<>&]/g, " ");
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
  const scope = useId();
  const [conversations, setConversations] = useState<ChatConversation[]>(load);
  const [activeId, setActiveId] = useState(() => conversations[0]?.id ?? "");
  const [generating, setGenerating] = useState<{ conversationId: string; messageId: string } | null>(null);
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [plan, setPlan] = useState("free");
  const [keyOpen, setKeyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [convMenu, setConvMenu] = useState<string | null>(null); // id da conversa com o menu ⋯ aberto
  const [renaming, setRenaming] = useState<string | null>(null); // id da conversa sendo renomeada
  const [quality, setQuality] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false); // menu de conta na sidebar
  const [paletteOpen, setPaletteOpen] = useState(false); // ⌘K / Ctrl K: busca e comandos
  const freshRef = useRef<Set<string>>(new Set()); // imagens que chegaram nesta sessão (animam ao aparecer)
  const sampleRef = useRef<{ t: number; chars: number; samples: number[] }>({ t: 0, chars: 0, samples: [] }); // velocidade do streaming
  usePtBrComponents();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(o => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const accountRef = useRef<HTMLDivElement>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [modelId, setModelId] = useState(() => { try { return localStorage.getItem(MODEL_KEY) ?? ""; } catch { return ""; } });
  const [compact, setCompact] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!accountMenu) return;
    const onDown = (e: MouseEvent) => { if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountMenu(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [accountMenu]);
  const newChatRef = useRef<HTMLButtonElement>(null);
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
  // Gesto de borda: arrastar da esquerda pra direita (começando perto da borda) abre o menu.
  const edgeSwipe = useRef({ x: 0, y: 0, active: false });
  const active = conversations.find(c => c.id === activeId) ?? conversations[0];
  const busy = generating !== null;
  const model = models.find(m => m.id === modelId && !m.locked) ?? models.find(m => !m.locked) ?? models[0]!;
  const outOfTokens = usage !== null && usage.limit > 0 && usage.remaining <= 0;
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
    if (p.get("buy") === "1" || p.get("key") === "1") { history.replaceState(null, "", location.pathname); if (!getKey()) setKeyOpen(true); }
  }, []);
  // Plan, models (Pro ones arrive locked) and today's token usage.
  const loadMe = useCallback(() => {
    api.me().then(me => {
      if (Array.isArray(me.models) && me.models.length) setModels(me.models.map(m => ({ ...m, badge: m.tier === "pro" ? "Pro" : undefined })));
      if (me.plan) setPlan(me.plan);
      if (typeof me.limit === "number" && typeof me.used === "number") setUsage({ used: me.used, limit: me.limit, remaining: typeof me.remaining === "number" ? me.remaining : Math.max(0, me.limit - me.used) });
      else if (typeof me.used === "number") setUsage({ used: me.used, limit: 0, remaining: Number.POSITIVE_INFINITY }); // Pro: sem limite, mas guarda o uso do dia pra exibir
    }).catch(() => { /* keep the fallback model; the meter stays hidden */ });
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);
  const applyPlan = useCallback((p: string) => { setPlan(p); loadMe(); }, [loadMe]);
  const chooseModel = (id: string) => {
    const next = models.find(m => m.id === id);
    if (!next || next.locked) return;
    setModelId(id);
    try { localStorage.setItem(MODEL_KEY, id); } catch { /* private mode */ }
  };
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setCompact(root.clientWidth < COMPACT_BELOW);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (!compact) setDrawer(false); }, [compact]);
  const drawerWas = useRef(false);
  useEffect(() => {
    if (drawerWas.current === drawer) return;
    drawerWas.current = drawer;
    if (drawer) newChatRef.current?.focus({ preventScroll: true });
    else if (compact) menuRef.current?.focus({ preventScroll: true });
  }, [drawer, compact]);

  const toBottom = (smooth: boolean) => { const s = scrollerRef.current; if (s) s.scrollTo({ top: s.scrollHeight, behavior: smooth && !reduceMotion ? "smooth" : "auto" }); };
  useLayoutEffect(() => { pinned.current = true; toBottom(false); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Re-pin on a new message, but let the ResizeObserver do the actual scroll (instant) so a
  // smooth scroll here isn't interrupted by it — that fight caused a stutter at each reply start.
  useEffect(() => { pinned.current = true; toBottom(false); }, [active?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const observer = new ResizeObserver(() => { if (pinned.current) toBottom(false); });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
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
      { conversationId: 0, mode: "chat", model: model.id, messages: history, quality: quality && plan === "pro", params: { temperature: 0.6, top_p: 0.9, max_tokens: 4096 } },
      {
        onUsage: setUsage,
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
  const historyOf = (messages: ChatMessage[]): Msg[] => messages.filter(m => m.text && m.state !== "thinking").map(m => ({ role: m.role, content: m.text }));

  // Ferramenta: gera uma imagem (Venice) e devolve como mensagem do assistente.
  const generateImage = (conversationId: string, messageId: string, imgPrompt: string) => {
    setGenerating({ conversationId, messageId });
    api.image(imgPrompt)
      .then(res => {
        if (typeof res.used === "number") setUsage({ used: res.used, limit: typeof res.limit === "number" ? res.limit : 0, remaining: typeof res.remaining === "number" ? res.remaining : Number.POSITIVE_INFINITY });
        freshRef.current.add(messageId); // chegou agora: aparece do ruído até ficar nítida
        patchMessage(conversationId, messageId, m => ({ ...m, state: "done", text: imgPrompt, image: res.image } as ChatMessage));
        setGenerating(g => (g && g.messageId === messageId ? null : g));
        if (typeof document !== "undefined" && document.hidden) notifyReply(t("Your image is ready."));
      })
      .catch(err => {
        const msg = String(err?.message || "");
        const text = msg === "daily_token_limit" ? t("You've hit today's message limit.") : t("Couldn't generate the image. Try again.");
        patchMessage(conversationId, messageId, m => ({ ...m, state: "done", text }));
        setGenerating(g => (g && g.messageId === messageId ? null : g));
        if (msg === "daily_token_limit") loadMe();
      });
  };

  const send = (text: string, title?: string) => {
    const prompt = text.trim();
    if (!prompt || busy || !active || outOfTokens) return;
    track("pergunta_enviada");
    // Pede permissão de notificação no gesto de enviar (pra avisar quando a resposta ficar pronta).
    try { if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); } catch { /* ignore */ }
    // Imagem: comando /imagem <descrição> OU pedido em linguagem natural ("gere uma imagem de...").
    const cmd = /^\/(?:imagem|image|img)\s+([\s\S]+)/i.exec(prompt);
    const imgDesc = cmd ? cmd[1]!.trim() : imageIntent(prompt); // string = imagem; null = conversa
    const userText = cmd ? cmd[1]!.trim() : prompt; // natural: mostra o que a pessoa escreveu
    const userMsg: ChatMessage = { id: nextId("prompt"), role: "user", text: userText, state: "done" };
    const replyId = nextId("reply");
    const before = active.messages;
    setConversations(list => list.map(c => c.id !== active.id ? c : { ...c, title: c.messages.length === 0 ? titleFrom(title || userText) : c.title, updated: "Now", ts: Date.now(), messages: [...c.messages, userMsg, { id: replyId, role: "assistant", text: "", state: "thinking", model: imgDesc ? t("Image") : model.short } as ChatMessage] } as ChatConversation));
    if (imgDesc) generateImage(active.id, replyId, imgDesc);
    else run(active.id, replyId, historyOf([...before, userMsg]));
  };
  const regenerate = () => {
    if (busy || !active || outOfTokens) return;
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
    { id: "key", label: plan === "pro" ? t("Access key") : t("Unlock Pro"), group: t("Actions"), icon: plan === "pro" ? <KeyRound size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />, keywords: ["pro", "chave", "key"] },
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
    else if (item.id === "image") { composerRef.current?.fill("/imagem "); composerRef.current?.focus(); }
    else if (item.id === "key") setKeyOpen(true);
    else if (item.id === "settings") setSettingsOpen(true);
    else if (item.id.startsWith("model:")) chooseModel(item.id.slice(6));
    else if (item.id.startsWith("chat:")) select(item.id.slice(5));
  };
  // Abre o menu com um arrasto curto a partir da borda esquerda (sem bloquear toques nem o scroll).
  const onEdgeTouchStart = (e: ReactTouchEvent<HTMLElement>) => {
    if (!compact || drawer) return;
    const touch = e.touches[0]; if (!touch) return;
    edgeSwipe.current = { x: touch.clientX, y: touch.clientY, active: touch.clientX <= 30 };
  };
  const onEdgeTouchMove = (e: ReactTouchEvent<HTMLElement>) => {
    if (!edgeSwipe.current.active || drawer) return;
    const touch = e.touches[0]; if (!touch) return;
    const dx = touch.clientX - edgeSwipe.current.x, dy = touch.clientY - edgeSwipe.current.y;
    if (dx > 46 && Math.abs(dx) > Math.abs(dy) * 1.3) { edgeSwipe.current.active = false; setDrawer(true); }
  };
  const onEdgeTouchEnd = () => { edgeSwipe.current.active = false; };
  const select = (id: string) => { if (id !== activeId) finish("done"); setActiveId(id); setDrawer(false); };
  const newChat = () => {
    finish("done");
    const empty = conversations.find(c => c.messages.length === 0);
    if (empty) setActiveId(empty.id);
    else { const id = nextId("chat"); setConversations(list => [{ id, title: t("New chat"), updated: t("Now"), ts: Date.now(), messages: [] } as ChatConversation, ...list]); setActiveId(id); }
    setDrawer(false);
    composerRef.current?.focus();
  };
  // Renomear / excluir conversa (recursos padrão de qualquer chat).
  const renameConversation = (id: string, title: string) => {
    const name = title.trim();
    setRenaming(null);
    if (!name) return;
    setConversations(list => list.map(c => c.id === id ? { ...c, title: name } : c));
  };
  const deleteConversation = (id: string) => {
    setConvMenu(null);
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

  useEffect(() => {
    if (!convMenu) return;
    const close = (e: Event) => { const el = e.target as HTMLElement; if (!el.closest(".hx-convmore") && !el.closest(".hx-convmenu")) setConvMenu(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [convMenu]);

  // Drawer + scrim share one brisk spring so they open and settle together (no flash on close).
  const spring: Transition = reduceMotion ? { duration: 0 } : motionTokens.spring.gentle;
  const pop: Transition = reduceMotion ? { duration: 0 } : motionTokens.spring.gentle;
  const lastMessage = active?.messages[active.messages.length - 1];
  // Medidor de contexto do topo: tamanho da conversa (estimado como no servidor) sobre a janela do modelo.
  const ctxMax = (model as ModelOption & { ctx?: number | null }).ctx || 0;
  const ctxUsed = active ? estTokens(active.messages.map(m => m.text).join("\n")) : 0;
  const ctx = ctxMax ? { used: Math.min(ctxUsed, ctxMax), max: ctxMax, label: `${ctxFmt(ctxUsed)} ${t("of")} ${ctxFmt(ctxMax)}` } : null;
  // Conta: tokens grátis que ainda restam hoje (contador animado); Pro não tem limite diário.
  const tokensLeft = usage && usage.limit > 0 ? Math.max(0, Math.round(usage.remaining)) : null;

  return (
    <div ref={rootRef} className={`${styles.root} hx-chat`} data-compact={compact} data-drawer={drawer} onKeyDown={event => { if (event.key === "Escape" && drawer) { event.stopPropagation(); setDrawer(false); } }}>
      <AnimatePresence>
        {compact && drawer ? <motion.div key="scrim" className={styles.scrim} onClick={() => setDrawer(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring} /> : null}
      </AnimatePresence>
      <motion.nav className={styles.sidebar} aria-label={t("Conversations")} inert={compact && !drawer} initial={false} animate={{ x: compact && !drawer ? "-100%" : "0%" }} transition={spring}
        drag={compact && drawer && !reduceMotion ? "x" : false} dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.5, right: 0 }} dragMomentum={false}
        onDragEnd={(_e, info) => { if (info.offset.x < -60 || info.velocity.x < -400) setDrawer(false); }}>
        <div className={`${styles.sidebarTop} hx-brandrow`}>
          <a className="hx-brand2" href="/" aria-label="Heretic, home"><CicadaMask w={34} h={12} />Heretic</a>
          {compact ? <button type="button" className={styles.iconButton} onClick={() => setDrawer(false)} aria-label={t("Close")} title={t("Close")}><X size={16} aria-hidden="true" /></button> : null}
        </div>
        <div className="hx-newrow">
          <Button ref={newChatRef} variant="secondary" size="sm" className="hx-newbtn" onClick={newChat}><PlusCheckIcon size={16} aria-hidden="true" />{t("New chat")}</Button>
          <Tooltip content={t("Search and commands")} side="bottom">
            <Button variant="ghost" size="sm" className="hx-kbd" aria-label={`${t("Search and commands")} (${KBD})`} onClick={() => setPaletteOpen(true)}>{KBD}</Button>
          </Tooltip>
        </div>
        <LayoutGroup>
          <ul className={`${styles.conversations} hx-convlist`}>
            <AnimatePresence initial={false}>
              {(() => {
                const out: ReactNode[] = [];
                let lastKey = "";
                for (const c of sortedChats) {
                  const key = groupKey(convTs(c));
                  if (key !== lastKey) { lastKey = key; out.push(<li key={`grp-${key}`} className="hx-convgroup" aria-hidden="true">{groupLabel(key)}</li>); }
                  const current = c.id === active?.id;
                  out.push(
                    <motion.li key={c.id} className="hx-convrow" layout={reduceMotion ? false : "position"} initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={pop}>
                      {renaming === c.id ? (
                        <input className="hx-convrename" autoFocus defaultValue={c.title} aria-label={t("Rename")}
                          onKeyDown={e => { if (e.key === "Enter") renameConversation(c.id, (e.target as HTMLInputElement).value); else if (e.key === "Escape") setRenaming(null); }}
                          onBlur={e => renameConversation(c.id, e.target.value)} />
                      ) : (
                        <Button variant={current ? "secondary" : "ghost"} size="sm" className="hx-convbtn" aria-current={current ? "page" : undefined} title={c.title} onClick={() => select(c.id)}>{c.title}</Button>
                      )}
                      {renaming === c.id ? null : (
                        <button type="button" className="hx-convmore" aria-label={t("More")} aria-expanded={convMenu === c.id} onClick={e => { e.stopPropagation(); setConvMenu(m => (m === c.id ? null : c.id)); }}><MoreHorizontal size={15} aria-hidden="true" /></button>
                      )}
                      <AnimatePresence>
                        {convMenu === c.id ? (
                          <motion.div className="hx-convmenu" role="menu" initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={motionTokens.spring.snappy}>
                            <button type="button" role="menuitem" onClick={() => { setConvMenu(null); setRenaming(c.id); }}><Pencil size={14} aria-hidden="true" />{t("Rename")}</button>
                            <button type="button" role="menuitem" className="hx-convdel" onClick={() => deleteConversation(c.id)}><Trash2 size={14} aria-hidden="true" />{t("Delete")}</button>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.li>
                  );
                }
                return out;
              })()}
            </AnimatePresence>
          </ul>
        </LayoutGroup>
        <div className={`${styles.user} hx-account`} ref={accountRef}>
          <AnimatePresence>
            {accountMenu ? (
              <motion.div className="hx-account-menu" role="menu"
                initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={motionTokens.spring.snappy}>
                <div className="hx-account-head">
                  <span className={`${styles.avatar} hx-avatar-cic`} aria-hidden="true"><CicadaMask w={26} h={20} color={plan === "pro" ? "#F0335A" : "#FFFFFF"} /></span>
                  <span className={styles.userText}>
                    <span className={`${styles.userName} hx-accname`}>{t("Anonymous")}{plan === "pro" ? <Badge tone="success" size="sm" pill className="hx-founder">{t("Founder")}</Badge> : null}</span>
                    <span className={styles.userDetail}>{plan === "pro" ? t("Pro · every AI unlocked") : t("Free · no account")}</span>
                  </span>
                </div>
                <button type="button" role="menuitem" className="hx-account-item" onClick={() => { setAccountMenu(false); setKeyOpen(true); }}>
                  {plan === "pro" ? <KeyRound size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}<span>{plan === "pro" ? t("Access key") : t("Unlock Pro")}</span>
                </button>
                <button type="button" role="menuitem" className="hx-account-item" onClick={() => { setAccountMenu(false); setSettingsOpen(true); }}>
                  <SettingsIcon size={15} aria-hidden="true" /><span>{t("Settings")}</span>
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <Button variant="ghost" className="hx-accbtn" aria-haspopup="menu" aria-expanded={accountMenu} onClick={() => setAccountMenu(o => !o)}>
            <span className="hx-avatar-cic hx-accavatar" aria-hidden="true"><CicadaMask w={30} h={11} color={plan === "pro" ? "#F0335A" : "#FFFFFF"} /></span>
            <span className="hx-acctext">
              <span className="hx-accname">{t("Anonymous")}{plan === "pro" ? <Badge tone="success" size="sm" pill className="hx-founder">{t("Founder")}</Badge> : null}</span>
              <span className="hx-accline">
                {tokensLeft !== null
                  ? <><span className="hx-accnum"><AnimatedCounter value={tokensLeft} locale={lang === "pt" ? "pt-BR" : "en-US"} /></span><span>{t("tokens left today")}</span></>
                  : <span>{plan === "pro" ? t("No daily limit") : t("Free · no account")}</span>}
              </span>
            </span>
            <span className="hx-acccaret" aria-hidden="true"><ChevronIcon size={16} state={!accountMenu} /></span>
          </Button>
        </div>
      </motion.nav>

      <section className={styles.main} aria-label={active ? active.title : "Chat"} inert={compact && drawer}
        onTouchStart={onEdgeTouchStart} onTouchMove={onEdgeTouchMove} onTouchEnd={onEdgeTouchEnd}>
        <header className={`${styles.header} hx-header`} data-compact={compact ? "1" : "0"}>
          {compact ? <button ref={menuRef} type="button" className={styles.iconButton} onClick={() => setDrawer(true)} aria-label={t("Show conversations")} aria-expanded={drawer}><PanelLeft size={18} aria-hidden="true" /></button> : null}
          <h2 className={`${styles.title} hx-title`}>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span key={active?.title ?? "none"} className={styles.titleText} initial={reduceMotion ? false : { opacity: 0, y: 6, filter: `blur(${motionTokens.blur.soft}px)` }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, transition: { duration: 0 } }} transition={reduceMotion ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: standard }}>{active?.title ?? "Chat"}</motion.span>
            </AnimatePresence>
          </h2>
          {!compact && ctx ? (
            <div className="hx-ctx" role="group" aria-label={`${t("Conversation context")}: ${ctx.label}`}>
              <span className="hx-ctxbar"><Progress value={ctx.used} max={ctx.max} /></span>
              <span className="hx-ctxtxt" aria-hidden="true">{ctx.label}</span>
            </div>
          ) : null}
          {compact ? <button type="button" className={styles.iconButton} onClick={newChat} aria-label={t("New chat")} title={t("New chat")}><SquarePen size={18} aria-hidden="true" /></button> : null}
        </header>

        <div ref={scrollerRef} className={styles.scroller} onScroll={event => { const n = event.currentTarget; pinned.current = n.scrollHeight - n.scrollTop - n.clientHeight < 56; }}>
          <motion.div key={active?.id} ref={threadRef} className={`${styles.thread} hx-thread`} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: standard }}>
            {active && active.messages.length === 0 ? (
              <div className={styles.empty}>
                <motion.span className={`${styles.emptyMark} hx-empty-mark`} aria-hidden="true" initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={pop}><CicadaMask w={200} h={74} shimmer={!reduceMotion} /></motion.span>
                <h3 className={`${styles.emptyTitle} hx-empty-title hx-chrome-text`}>{t("Ask anything.")}</h3>
              </div>
            ) : null}
            <ol className={`${styles.messages} hx-turns`} aria-label={t("Messages")}>
              <AnimatePresence initial={false}>
                {turnsOf(active?.messages ?? []).map(tn => {
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
                        reply={r}
                        shown={shown}
                        caret={caret}
                        fresh={!!r && freshRef.current.has(r.id)}
                        canRegenerate={!!r && r.id === lastMessage?.id && !busy}
                        busy={busy}
                        onRegenerate={regenerate}
                        onFeedback={e => { if (r) rateReply(convId, r.id, e); }}
                        onPdf={el => exportReplyPdf(el, active?.title || "Heretic")}
                        onMd={text => downloadBlob(`${fileSlug(active?.title || "heretic")}.md`, text, "text/markdown;charset=utf-8")}
                        onImage={(src, name) => downloadDataUrl(`${fileSlug(name)}.webp`, src)}
                        onOption={v => send(v)}
                      />
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          </motion.div>
        </div>

        <footer className={`${styles.composer} hx-composer`}>
          <Composer
            ref={composerRef}
            models={models}
            model={model}
            onModel={chooseModel}
            busy={busy}
            progress={null}
            placeholder={t("Ask anything")}
            maxLength={MAX_PROMPT_CHARS}
            reduced={reduceMotion}
            blocked={outOfTokens ? OUT_OF_TOKENS : null}
            onSubmit={payload => send(withAttachments(payload), payload.text || payload.attachments[0]?.name)}
            onStop={() => finish("stopped")}
            quality={quality}
            onQuality={() => setQuality(q => !q)}
            qualityAvailable={plan === "pro"}
          />
          {usage && usage.limit > 0 ? <UsageLine plan={plan} {...usage} /> : <p className={styles.hint}>{t("Uncensored. Enter sends, Shift+Enter adds a line.")}</p>}
        </footer>
        <span className={styles.srOnly} role="status">{busy ? t("Heretic is replying") : ""}</span>
      </section>
      <SettingsModal open={settingsOpen} plan={plan} usage={usage} onClose={() => setSettingsOpen(false)} onManageKey={() => setKeyOpen(true)} />
      <KeyModal open={keyOpen} plan={plan} onClose={() => setKeyOpen(false)} onPlan={applyPlan} />
      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent title={t("Search and commands")} className="hx-palette">
          <CommandPalette items={paletteItems} placeholder={t("Search chats, models and actions")} autoFocus onSelect={runCommand} onClose={() => setPaletteOpen(false)} label={t("Search and commands")} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
