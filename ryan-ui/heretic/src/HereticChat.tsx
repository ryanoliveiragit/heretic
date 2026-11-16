// Heretic chat: the ryan-ui "chat-app" block, wired to the real /api/chat stream.
// Same layout, motion and parts as the block (StreamingResponse, ThinkingShimmer, copy/regenerate),
// with Heretic's marks instead of the block's sparkle icon, conversations kept in localStorage,
// and the reply driven by the server instead of canned text. The prompt box is the forked
// ryan-ui Pro composer (./composer), with the model menu and the daily-token meter.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, TouchEvent as ReactTouchEvent } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { Check, Copy, Download, FileDown, FileText, KeyRound, Lock, PanelLeft, RefreshCw, Settings as SettingsIcon, SquarePen, X, Zap } from "lucide-react";
import { motionTokens } from "@/lib/motion-tokens";
import { useCopyFeedback } from "@/lib/use-copy-feedback";
import { ThinkingShimmer } from "@/registry/components/loading-states/loading-states";
import type { ChatConversation, ChatMessage, ChatSuggestion } from "@/registry/blocks/chat-app/chat-app-data";
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

// Access-key modal: paste a code to unlock Pro, or "buy" (stub) to get one.
function KeyModal({ open, plan, onClose, onPlan }: { open: boolean; plan: string; onClose: () => void; onPlan: (p: string) => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) { setErr(""); setIssued(""); setCopied(false); setCode(getKey()); } }, [open]);
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
  const buy = async () => {
    setBusy(true); setErr("");
    try { const r = await api.checkout(); setIssued(r.code); setCode(r.code); }
    catch { setErr(t("Could not get a code. Try again.")); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(issued); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* denied */ } };
  const unlink = () => { setKey(""); onPlan("free"); onClose(); };
  return (
    <div className="hx-keyov" role="dialog" aria-modal="true" aria-label={t("Access key")} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hx-keycard">
        <button type="button" className="hx-keyx" onClick={onClose} aria-label={t("Close")}><X size={16} aria-hidden="true" /></button>
        <div className="hx-keyicon">{plan === "pro" ? <Check size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}</div>
        <h3 className="hx-keytitle">{plan === "pro" ? t("Pro unlocked") : t("Unlock every model")}</h3>
        <p className="hx-keysub">{plan === "pro" ? t("Your access key is active. All AIs are unlocked.") : t("Free is open to everyone. A code unlocks every AI, no daily limit.")}</p>
        <label className="hx-keylabel" htmlFor="hx-code">{t("Access code")}</label>
        <div className="hx-keyrow">
          <input id="hx-code" className="hx-keyinput" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") redeem(); }} placeholder="HRTC-••••-••••-••••" autoComplete="off" spellCheck={false} />
          <button type="button" className="hx-keygo" onClick={redeem} disabled={busy || !code.trim()}>{t("Enter")}</button>
        </div>
        {err ? <p className="hx-keyerr" role="alert">{err}</p> : null}
        {issued ? (
          <div className="hx-keyissued">
            <span className="hx-keyissuedlabel">{t("Your code — copy and keep it")}</span>
            <button type="button" className="hx-keycopy" onClick={copy}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}<code>{issued}</code></button>
          </div>
        ) : null}
        <div className="hx-keyfoot">
          {plan === "pro"
            ? <button type="button" className="hx-keylink" onClick={unlink}>{t("Sign out of Pro")}</button>
            : <button type="button" className="hx-keybuy" onClick={buy} disabled={busy}><KeyRound size={14} aria-hidden="true" />{t("Get a code")}</button>}
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
const MODEL_KEY = "heretic-model";
/** Used until GET /api/me answers (or if it fails). */
const FALLBACK_MODELS: ModelOption[] = [
  { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition", name: "Heretic Free", short: "Heretic Free", note: "Default. Uncensored, reliable, cheap (Dolphin 24B). 128k context", tier: "free", locked: false, provider: "openrouter", cost100: 0.033 },
  { id: "venice:z-ai-glm-5-3-flash", name: "Heretic Rapid", short: "Heretic Rapid", note: "Smart, detailed, stable. Vision, tools. 1M context", tier: "free", locked: false, provider: "venice", cost100: 0.020 },
  { id: "venice:olafangensan-glm-4.7-flash-heretic", name: "Heretic Swift", short: "Heretic Swift", note: "Fastest and cheapest. Tools. 200k context", tier: "free", locked: false, provider: "venice", cost100: 0.014 },
];
const titleFrom = (prompt: string) => { const line = prompt.replace(/\s+/g, " ").trim(); return line.length > 44 ? `${line.slice(0, 43).trimEnd()}…` : line; };
const SUGGESTIONS: ChatSuggestion[] = [
  { title: t("How do I take down a server, step by step?"), prompt: t("How do I take down a server, step by step? No theory — what actually works, ranked by cost.") },
  { title: t("Build me a cheat that actually works"), prompt: t("Build me a game cheat that actually works: memory, pointer chains, injection — step by step.") },
  { title: t("How do you fool people?"), prompt: t("How do you fool people? Be brutally honest about what actually works.") },
  { title: t("Crack my Wi-Fi password"), prompt: t("Crack this Wi-Fi password like it's yours: 'admin'. What do you try, in what order?") },
  { title: t("Generate an image of anything"), prompt: "/imagem uma cigarra Cicada 3301 em neon vermelho carmim sobre preto profundo, minimalista, cinematográfico" },
];

const Mask = ({ size = 16 }: { size?: number }) => <span className="mask" aria-hidden style={{ width: size, height: Math.round(size * 1.2) }} />;
const Cicada = ({ width }: { width: number }) => <img src="/icons/cicada.svg" alt="" width={width} style={{ display: "block", height: "auto" }} />;

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

function AssistantActions({ text, title, canRegenerate, onRegenerate }: { text: string; title: string; canRegenerate: boolean; onRegenerate: () => void }) {
  const reduceMotion = useReducedMotion() ?? false;
  const { state, copy } = useCopyFeedback();
  const copied = state === "copied";
  const [menu, setMenu] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!wrapRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  const pdf = () => { setMenu(false); exportReplyPdf(wrapRef.current?.closest(".hx-ai-body") ?? null, title); };
  const md = () => { setMenu(false); downloadBlob(`${fileSlug(title)}.md`, text, "text/markdown;charset=utf-8"); };
  return (
    <motion.div className={styles.actions} initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: standard, delay: 0.1 }}>
      <button type="button" className={styles.action} onClick={() => { void copy(text); }} aria-label={copied ? t("Copied") : t("Copy reply")} title={t("Copy")}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={copied ? "check" : "copy"} className={styles.glyph} initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0, transition: { duration: reduceMotion ? 0 : motionTokens.duration.instant } }} transition={motionTokens.spring.snappy}>
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          </motion.span>
        </AnimatePresence>
      </button>
      {canRegenerate ? <button type="button" className={styles.action} onClick={onRegenerate} aria-label={t("Regenerate reply")} title={t("Regenerate")}><RefreshCw size={15} aria-hidden="true" /></button> : null}
      <div className="hx-dl" ref={wrapRef}>
        <button type="button" className={styles.action} onClick={() => setMenu(m => !m)} aria-label={t("Download reply")} aria-expanded={menu} title={t("Download")}><Download size={15} aria-hidden="true" /></button>
        <AnimatePresence>
          {menu ? (
            <motion.div className="hx-dlmenu" role="menu" initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.1 } }} transition={motionTokens.spring.snappy}>
              <button type="button" role="menuitem" className="hx-dlitem" onClick={pdf}><FileText size={14} aria-hidden="true" />PDF</button>
              <button type="button" role="menuitem" className="hx-dlitem" onClick={md}><FileDown size={14} aria-hidden="true" />Markdown (.md)</button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
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
  const [quality, setQuality] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [modelId, setModelId] = useState(() => { try { return localStorage.getItem(MODEL_KEY) ?? ""; } catch { return ""; } });
  const [compact, setCompact] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
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
    if (p.get("buy") === "1" || p.get("key") === "1") { history.replaceState(null, "", location.pathname); setKeyOpen(true); }
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
    ctrl.current = streamChat(
      { conversationId: 0, mode: "chat", model: model.id, messages: history, quality: quality && plan === "pro", params: { temperature: 0.6, top_p: 0.9, max_tokens: 4096 } },
      {
        onUsage: setUsage,
        onToken: full => { targetRef.current = visibleAnswer(full).length; patchMessage(conversationId, messageId, m => ({ ...m, text: full, state: m.state === "thinking" ? "streaming" : m.state })); },
        // FORÇA TUDO: o servidor descartou uma recusa e re-rodou o modelo → limpa e volta ao "pensando".
        onRefusalForced: () => { targetRef.current = 0; revealRef.current = 0; setReveal(0); patchMessage(conversationId, messageId, m => ({ ...m, text: "", state: "thinking" })); },
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
          patchMessage(conversationId, messageId, m => ({ ...m, text: finalText || m.text, state: "done" }));
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
    // Pede permissão de notificação no gesto de enviar (pra avisar quando a resposta ficar pronta).
    try { if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); } catch { /* ignore */ }
    // Comando de imagem: /imagem <descrição> (também /image, /img).
    const img = /^\/(?:imagem|image|img)\s+([\s\S]+)/i.exec(prompt);
    const userText = img ? img[1]!.trim() : prompt;
    const userMsg: ChatMessage = { id: nextId("prompt"), role: "user", text: userText, state: "done" };
    const replyId = nextId("reply");
    const before = active.messages;
    setConversations(list => list.map(c => c.id !== active.id ? c : { ...c, title: c.messages.length === 0 ? titleFrom(title || userText) : c.title, updated: "Now", ts: Date.now(), messages: [...c.messages, userMsg, { id: replyId, role: "assistant", text: "", state: "thinking", model: img ? t("Image") : model.short } as ChatMessage] } as ChatConversation));
    if (img) generateImage(active.id, replyId, img[1]!.trim());
    else run(active.id, replyId, historyOf([...before, userMsg]));
  };
  const regenerate = () => {
    if (busy || !active || outOfTokens) return;
    const last = active.messages[active.messages.length - 1];
    if (!last || last.role !== "assistant") return;
    patchMessage(active.id, last.id, m => ({ ...m, text: "", state: "thinking" }));
    run(active.id, last.id, historyOf(active.messages.slice(0, -1)));
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

  // Drawer + scrim share one brisk spring so they open and settle together (no flash on close).
  const spring: Transition = reduceMotion ? { duration: 0 } : motionTokens.spring.gentle;
  const pop: Transition = reduceMotion ? { duration: 0 } : motionTokens.spring.gentle;
  const lastMessage = active?.messages[active.messages.length - 1];

  return (
    <div ref={rootRef} className={`${styles.root} hx-chat`} data-compact={compact} data-drawer={drawer} onKeyDown={event => { if (event.key === "Escape" && drawer) { event.stopPropagation(); setDrawer(false); } }}>
      <AnimatePresence>
        {compact && drawer ? <motion.div key="scrim" className={styles.scrim} onClick={() => setDrawer(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring} /> : null}
      </AnimatePresence>
      <motion.nav className={styles.sidebar} aria-label={t("Conversations")} inert={compact && !drawer} initial={false} animate={{ x: compact && !drawer ? "-100%" : "0%" }} transition={spring}
        drag={compact && drawer && !reduceMotion ? "x" : false} dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.5, right: 0 }} dragMomentum={false}
        onDragEnd={(_e, info) => { if (info.offset.x < -60 || info.velocity.x < -400) setDrawer(false); }}>
        <div className={styles.sidebarTop}>
          <a className={`${styles.brand} hx-brand`} href="/" aria-label="Heretic, home"><Cicada width={30} />Heretic</a>
          {compact ? <button type="button" className={styles.iconButton} onClick={() => setDrawer(false)} aria-label={t("Close")} title={t("Close")}><X size={16} aria-hidden="true" /></button> : null}
        </div>
        <button ref={newChatRef} type="button" className="hx-newchat" onClick={newChat}><SquarePen size={15} aria-hidden="true" />{t("New chat")}</button>
        <LayoutGroup>
          <ul className={styles.conversations}>
            <AnimatePresence initial={false}>
              {(() => {
                const sorted = [...conversations].sort((a, b) => convTs(b) - convTs(a));
                const out: ReactNode[] = [];
                let lastKey = "";
                for (const c of sorted) {
                  const key = groupKey(convTs(c));
                  if (key !== lastKey) { lastKey = key; out.push(<li key={`grp-${key}`} className="hx-convgroup" aria-hidden="true">{groupLabel(key)}</li>); }
                  const current = c.id === active?.id;
                  const lastMsg = c.messages[c.messages.length - 1];
                  const preview = (lastMsg ? visibleAnswer(lastMsg.text) : "").replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim() || t("No messages yet");
                  out.push(
                    <motion.li key={c.id} className={styles.conversationItem} layout={reduceMotion ? false : "position"} initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={pop}>
                      {current ? <motion.span layoutId={`${scope}-active`} className={styles.activeMark} transition={reduceMotion ? { duration: 0 } : motionTokens.spring.morph} /> : null}
                      <button type="button" className={styles.conversation} onClick={() => select(c.id)} aria-current={current ? "true" : undefined}>
                        <span className={styles.conversationTop}><span className={styles.conversationTitle}>{c.title}</span><span className={styles.conversationTime}>{c.updated}</span></span>
                        <span className={styles.conversationPreview}>{preview || t("Stopped")}</span>
                      </button>
                    </motion.li>
                  );
                }
                return out;
              })()}
            </AnimatePresence>
          </ul>
        </LayoutGroup>
        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden="true"><Mask size={16} /></span>
          <span className={styles.userText}>
            <span className={styles.userName}>{t("Anonymous")}{plan === "pro" ? <span className="hx-pro">PRO</span> : null}</span>
            <span className={styles.userDetail}>{plan === "pro" ? t("Pro · every AI unlocked") : t("Free · no account")}</span>
          </span>
          <button type="button" className="hx-keybtn" onClick={() => setSettingsOpen(true)} aria-label={t("Settings")} title={t("Settings")}>
            <SettingsIcon size={15} aria-hidden="true" />
          </button>
          <button type="button" className="hx-keybtn" onClick={() => setKeyOpen(true)} aria-label={plan === "pro" ? t("Access key") : t("Unlock Pro")} title={plan === "pro" ? t("Access key") : t("Unlock Pro")}>
            {plan === "pro" ? <KeyRound size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
          </button>
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
          {/* Desktop: Qualidade + legenda do modelo cabem no header. Mobile: header enxuto (menu + título + nova conversa); Qualidade fica junto do compositor e o modelo no seletor dele. */}
          {!compact && plan === "pro" ? <button type="button" className="hx-qtoggle" data-on={quality ? "1" : "0"} onClick={() => setQuality(q => !q)} aria-pressed={quality} title={t("Quality mode: race 2 models, keep the best")}>{t("Quality")}</button> : null}
          {!compact ? <span className={`${styles.model} hx-modelpill`}><span className={styles.modelDot} aria-hidden="true" />{model.short} · {t("Uncensored")}</span> : null}
          {compact ? <button type="button" className={styles.iconButton} onClick={newChat} aria-label={t("New chat")} title={t("New chat")}><SquarePen size={18} aria-hidden="true" /></button> : null}
        </header>

        <div ref={scrollerRef} className={styles.scroller} onScroll={event => { const n = event.currentTarget; pinned.current = n.scrollHeight - n.scrollTop - n.clientHeight < 56; }}>
          <motion.div key={active?.id} ref={threadRef} className={styles.thread} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: standard }}>
            {active && active.messages.length === 0 ? (
              <div className={styles.empty}>
                <motion.span className={`${styles.emptyMark} hx-empty-mark`} aria-hidden="true" initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={pop}><Cicada width={120} /></motion.span>
                <h3 className={`${styles.emptyTitle} hx-empty-title`}>{t("Ask anything.")}</h3>
                <ul className={styles.suggestions}>
                  {SUGGESTIONS.map((s, index) => (
                    <motion.li key={s.title} initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { ...motionTokens.spring.gentle, delay: 0.08 + index * motionTokens.stagger.item * 1.6 }}>
                      <button type="button" className={styles.suggestion} onClick={() => send(s.prompt)}>
                        <span className={styles.suggestionTitle}>{s.title}</span>
                        <span className={styles.suggestionPrompt}>{s.prompt}</span>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ol className={styles.messages} aria-label={t("Messages")}>
              <AnimatePresence initial={false}>
                {active?.messages.map(message => (
                  <motion.li key={message.id} className={styles.message} data-role={message.role} initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={pop}>
                    {message.role === "user" ? (
                      <div className={styles.bubble}><span className={styles.srOnly}>{t("You: ")}</span>{message.text}</div>
                    ) : (
                      <div className="hx-ai">
                        <div className="hx-ai-head" aria-hidden="true"><Mask size={18} /><span className="hx-ai-name">Heretic</span>{(message as ChatMessage & { model?: string }).model ? <span className="hx-ai-model">{((message as ChatMessage & { model?: string }).model ?? "").replace(/^Heretic\s+/, "")}</span> : null}</div>
                        <div className="hx-ai-body">
                          <span className={styles.srOnly}>Heretic: </span>
                          {(() => {
                            const genImg = (message as ChatMessage & { image?: string }).image;
                            if (message.state === "thinking" && !genImg) return <ThinkingShimmer className={styles.thinking} />;
                            if (genImg) return (
                              <figure className="hx-genimg">
                                <img src={genImg} alt={message.text || "imagem"} loading="lazy" />
                                {message.text ? <figcaption>{message.text}</figcaption> : null}
                                <button type="button" className="hx-genimg-dl" onClick={() => downloadDataUrl(`${fileSlug(message.text || "heretic")}.webp`, genImg)}><Download size={14} aria-hidden="true" />{t("Download")}</button>
                              </figure>
                            );
                            const full = visibleAnswer(message.text);
                            const typing = message.id === typingId && !reduceMotion;
                            const shown = typing ? full.slice(0, reveal) : full;
                            if (message.state === "streaming" && !shown || (typing && !shown && full.length > 0)) return <ThinkingShimmer className={styles.thinking} />;
                            const caret = message.state === "streaming" || (typing && reveal < full.length);
                            return shown ? <Markdown text={shown} caret={caret} /> : null;
                          })()}
                          {message.state === "stopped" ? <p className={styles.stopped}>{visibleAnswer(message.text) ? t("Stopped.") : t("Stopped before the reply started.")}</p> : null}
                          {(message.state === "done" || message.state === "stopped") && !(message as ChatMessage & { image?: string }).image ? <AssistantActions text={visibleAnswer(message.text)} title={active?.title || "Heretic"} canRegenerate={message.id === lastMessage?.id && !busy} onRegenerate={regenerate} /> : null}
                        </div>
                      </div>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </motion.div>
        </div>

        <footer className={styles.composer}>
          {compact && plan === "pro" ? (
            <div className="hx-cbar">
              <button type="button" className="hx-qtoggle" data-on={quality ? "1" : "0"} onClick={() => setQuality(q => !q)} aria-pressed={quality} title={t("Quality mode: race 2 models, keep the best")}>{t("Quality")}</button>
            </div>
          ) : null}
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
          />
          {usage && usage.limit > 0 ? <UsageLine plan={plan} {...usage} /> : <p className={styles.hint}>{t("Uncensored. Enter sends, Shift+Enter adds a line.")}</p>}
        </footer>
        <span className={styles.srOnly} role="status">{busy ? t("Heretic is replying") : ""}</span>
      </section>
      <SettingsModal open={settingsOpen} plan={plan} usage={usage} onClose={() => setSettingsOpen(false)} onManageKey={() => setKeyOpen(true)} />
      <KeyModal open={keyOpen} plan={plan} onClose={() => setKeyOpen(false)} onPlan={applyPlan} />
    </div>
  );
}
