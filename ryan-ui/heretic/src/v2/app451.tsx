import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import {
  ArrowLeft, Check, Coins, CreditCard, Crosshair, FileText, Image as ImageIcon, KeyRound, LogOut,
  ArrowRight, Menu, MessageSquare, Minus, Plus, Search, Settings, Swords, Code2, X as Fechar, Trash2,
  Download, RefreshCw, Maximize2, Ratio,
} from "lucide-react";
import { Switch } from "@pro/switch/switch";
import { AiAnswer, type Responder, type Source } from "./ai-answer/ai-answer";
import { Composer, withAttachments, wireAttachments, type ComposerHandle, type ModelOption, type SubmitPayload } from "./composer/ai-composer";
import { VoiceRecorder, MessageRow, type VoiceMessage } from "./voice/voice-recorder";
import { MetalCard } from "./metal-card";
import { PlushPet, BICHOS, CORES, type Bicho } from "./plush-pet";
import { TextShimmer } from "@pro/text-shimmer/text-shimmer";
import { StartBurn } from "@app/start-plate";
import { Progress } from "@pro/progress/progress";
import { Markdown } from "@app/markdown";
import { GlassSegmented } from "@pro/glass-segmented/glass-segmented";
import { ArenaAnswers, type ArenaData } from "@app/arena";
import { MessageScroller } from "@beui/components/agents/message-scroller";
import { CopyButton } from "@pro/copy-button/copy-button";
import { CodeBlock } from "./code-block/code-block";
import { PayDialog, pendingOrderId } from "@app/pay";
import { api, streamChat, getKey, setKey, authHeaders, LimitError, ImageError, tightestWindow } from "@app/api";
import type { Me, MeModel, Msg as WireMsg, Quota, WireAttachment, ImageEstilo, ImageFormato, ImageOpts, ImageResult, ImageRef } from "@app/api";

/* /app do 451.sh, redesign aprovado pelo Ryan em 19/11/2026 (protótipo da direção A), ligado ao servidor de verdade:
   plano, limites e créditos vêm de /api/me; respostas de /api/chat; Pro por Pix ou cripto em /api/pay;
   agente = afinador do servidor (enhance) com as preferências da aba "Seu agente"; arena = modo qualidade. */

/* ---------------------------------------------------------------- dados */
type Plano = "gratis" | "pro" | "plus";
type Pagina = "chat" | "imagens";
type Cfg = "chave" | "agente" | "planos" | "creditos" | "api";
type Periodo = "mensal" | "trimestral" | "anual";
type Compra = { tipo: "plano"; plano: "pro" | "plus"; periodo: Periodo } | { tipo: "creditos"; reais: number; creditos: number };
type Upsell = "perto" | "acabou" | "modelo" | "agente" | "arena" | "api";
interface Conta { chave: string | null; plano: Plano; creditosPlano: number; avulsos: number; ate?: string }
type UsoJusto = { blocked: boolean; resetAt: number | null; windows: { id: string; label: string; pct: number; resetAt: number | null }[] };
type MeX = Me & { tier?: "free" | "pro" | "plus"; credits?: { plan: number; extra: number; total: number; monthly: number } | null; fairUse?: UsoJusto | null };
type Pet = { bicho: Bicho; cor: string; nome: string; titulo: string; descricao: string };
type Prefs = { estilo: string; formato: string; quando: string; contexto: string };

const SUGESTOES = ["Mapeie o sistema e aponte as brechas", "Escreva o relatório do teste de invasão", "Encontre a falha neste código"];
const X_HANDLE = "451chat";
const PRECOS: Record<"pro" | "plus", Partial<Record<Periodo, number>>> = { pro: { mensal: 59.9, trimestral: 159.9, anual: 539.9 }, plus: { mensal: 149.9 } };
const PACOTES: [number, number][] = [[20, 2000], [50, 5000], [100, 10000]];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => v.toLocaleString("pt-BR");
const creditosDe = (v: number) => Math.round(v * 100);
const total = (c: Conta) => c.creditosPlano + c.avulsos;
const nomePlano = (p: Plano) => (p === "gratis" ? "Grátis" : p === "pro" ? "Pro" : "Pro Plus");
const mascara = (k: string) => `${k.slice(0, 8)}••••${k.slice(-4)}`;
const xIntent = `https://x.com/intent/post?text=${encodeURIComponent(`@${X_HANDLE} `)}`;
const BASE = "https://451sh.com/api/v1";
const ESPECIALISTAS_N = 8;

/* Valores lidos do servidor a cada render do App (os componentes de baixo leem daqui). */
let LIMITE = 15;
let RENOVA = "em breve";
const PET0: Pet = { bicho: "gota", cor: "#FF3B4E", nome: "Agente", titulo: "", descricao: "" };
const PREFS0: Prefs = { estilo: "equilibrado", formato: "passos", quando: "sempre", contexto: "" };
let petAtual: Pet = PET0;

const ler = <T,>(k: string, padrao: T): T => { try { const v = localStorage.getItem(k); return v ? { ...padrao, ...JSON.parse(v) } : padrao; } catch { return padrao; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio ou modo privado */ } };

/** Quando a janela renova, em português: "hoje às 14h30" ou "amanhã às 9h05". */
function quando(ts: number | null | undefined): string {
  if (!ts) return "em breve";
  const d = new Date(ts), hoje = new Date();
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1);
  const h = `${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === hoje.toDateString()) return `hoje às ${h}`;
  if (d.toDateString() === amanha.toDateString()) return `amanhã às ${h}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${h}`;
}
/** Chave paga 451-PRO-<validade>-<assinatura>: a validade em base 36 (segundos). */
function validadeDa(chave: string | null): string | undefined {
  const m = /^451-(?:PRO|PLUS)-([0-9A-Z]+)-[0-9A-Z]{16}$/i.exec(chave || "");
  if (!m) return undefined;
  const ms = parseInt(m[1]!, 36) * 1000;
  return isFinite(ms) ? new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : undefined;
}
/* Só a resposta final: tira o raciocínio <think> e loops de caractere repetido no fim. */
function visivel(raw: string): string {
  let t = (raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const open = t.lastIndexOf("<think>");
  if (open !== -1 && !/<\/think>/i.test(t.slice(open))) t = open <= 24 ? t.slice(0, open) : t.replace(/<\/?think>/gi, "");
  return t.replace(/([^\s])\1{23,}/g, (_m, c: string) => c.repeat(3)).replace(/^\s+/, "");
}
const IMG_NOUN = "imagem|imagens|fotos?|arte|desenhos?|ilustra\\w*|logos?|logotipos?|wallpapers?|avatar|banners?|p[ôo]ster\\w*|capas?|[íi]cones?|retratos?|pinturas?|renders?|cenas?|paisagens?";
const EDIT_VERBO = /^\s*(agora\s+)?(deix[ae]|mud[ae]|troc[ae]|coloc[ae]|p[õo]e|tir[ae]|adicion[ae]|acrescent[ae]|transform[ae]|fa[çz]a?\s+(ele|ela|isso)|pinte|aument[ae]|diminu[ai])\b/i;
const IMG_PALAVRA = new RegExp(`\\b(${IMG_NOUN})\\b`, "i");
function pedidoDeImagem(text: string): string | null {
  const s = (text || "").trim();
  const cmd = /^\/(?:imagem|image|img)\s+([\s\S]+)/i.exec(s);
  if (cmd) return cmd[1]!.trim();
  if (s.length < 5 || s.length > 600) return null;
  const verbo = new RegExp(`^\\s*(por favor,?\\s*)?(ger[ae]r?|cri[ae]r?|fa[çc]a|faz|desenh[ae]r?|ilustr[ae]r?|me (faz|cria|ger[ae]|desenh[ae]))\\b[\\s\\S]{0,25}?\\b(${IMG_NOUN})\\b`, "i");
  if (!verbo.test(s)) return null;
  const m = new RegExp(`\\b(${IMG_NOUN})\\b\\s*(de|do|da|com|:|mostrando)?\\s*([\\s\\S]+)$`, "i").exec(s);
  return m && m[3] ? m[3].trim() : s;
}

/* ---------------------------------------------------------------- conversas (no aparelho) */
type Msg =
  | { id: number; tipo: "ia"; pergunta: string; modelo: string; nomeModelo: string; agente?: string; resposta?: string; arena?: ArenaData & { reason?: string }; custo?: number; numero?: number; erro?: string; parada?: boolean; fontes?: Source[] }
  | { id: number; tipo: "img"; pergunta: string; creditos?: number; desc?: string; src?: string; token?: string; erro?: string; final?: string; opts?: ImageOpts; editar?: boolean; refs?: ImageRef[]; base?: string; galeriaId?: string; adulto?: boolean; idade?: boolean; sugestoes?: string[] }
  | { id: number; tipo: "audio"; audio: VoiceMessage; transcricao: string }
  | { id: number; tipo: "quebrando"; original: string };
interface Conversa { id: string; titulo: string; ts: number; msgs: Msg[] }
const STORE = "451-chats-v3";
let nextId = Date.now();
function carregarConversas(): Conversa[] {
  try {
    const l = JSON.parse(localStorage.getItem(STORE) || "[]") as Conversa[];
    // Resposta que ficou no meio (aba fechada durante a escrita) não roda de novo ao abrir.
    return l.map((c) => ({ ...c, msgs: c.msgs.filter((m) => m.tipo !== "quebrando" && m.tipo !== "audio").map((m) => (m.tipo === "ia" && m.resposta === undefined ? { ...m, resposta: "", erro: "A resposta foi interrompida." }
      : m.tipo === "img" && !m.src && !m.erro ? { ...m, erro: "A imagem foi interrompida. Peça de novo." } : m)) }));
  } catch { return []; }
}
/* Onde a pessoa estava (página e conversa aberta): o app instalado é fechado pelo celular ao trocar de app
   e, sem isso, reabria numa conversa nova como se a anterior não existisse. */
const UI_KEY = "451-ui";
function uiSalvo(): { pagina?: Pagina; ativa?: string | null } { try { return JSON.parse(localStorage.getItem(UI_KEY) || "{}"); } catch { return {}; } }
function ativaInicial(): string | null {
  try { if (new URLSearchParams(location.search).get("q")) return null; } catch { /* */ }
  const a = uiSalvo().ativa;
  return a && carregarConversas().some((c) => c.id === a) ? a : null;
}
function grupoDe(ts: number) {
  const ini = new Date(); ini.setHours(0, 0, 0, 0);
  const h = ini.getTime();
  return ts >= h ? "Hoje" : ts >= h - 864e5 ? "Ontem" : ts >= h - 7 * 864e5 ? "Esta semana" : "Antes";
}

/* Pedido em andamento: guardado fora do estado (não vai para o localStorage). */
type Evento = { type: "text"; text: string } | { type: "reasoning"; text: string } | { type: "sources"; sources: Source[] };
interface Pendente { history: WireMsg[]; model: string; enhance: boolean; quality: boolean; prefs: Prefs; creditosAntes: number; esforco: "baixo" | "medio" | "alto" | null }

/* ---------------------------------------------------------------- peças */
const Cig = ({ s = 22 }: { s?: number }) => <img src="/icons/cigarra-mini.svg" alt="" style={{ width: s }} />;
const LogoX = ({ s = 15 }: { s?: number }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
);
const celular = () => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
function Modal({ children, onClose, largo, label, classe, ativo = true }: { children: ReactNode; onClose: () => void; largo?: boolean; label: string; classe?: string; ativo?: boolean }) {
  const puxar = useDragControls();
  const [mob] = useState(celular);
  useEffect(() => {
    if (!ativo) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, ativo]);
  return (
    <motion.div className="m-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className={`m-caixa ${largo ? "h-largo" : ""} ${classe ?? ""}`} role="dialog" aria-modal="true" aria-label={label}
        initial={mob ? { y: "100%" } : { opacity: 0, y: 14, scale: 0.97 }} animate={mob ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }} exit={mob ? { y: "100%" } : { opacity: 0, y: 8, scale: 0.98 }}
        transition={mob ? { type: "spring", duration: 0.45, bounce: 0.08 } : { type: "spring", duration: 0.42, bounce: 0.12 }}
        drag={mob ? "y" : false} dragListener={false} dragControls={puxar} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.9 }}
        onDragEnd={(_e, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose(); }}>
        {mob && <div className="h-puxador" onPointerDown={(e) => puxar.start(e)} aria-hidden="true"><i /></div>}
        <button className="x-ib h-fechar" aria-label="Fechar" onClick={onClose}><Fechar size={18} /></button>
        {children}
      </motion.div>
    </motion.div>
  );
}

/* Agente: as letras do pedido quebram antes de ele afinar. */
function Quebrando({ texto, onFim }: { texto: string; onFim: () => void }) {
  const reduced = useReducedMotion() ?? false;
  const fim = useRef(onFim); fim.current = onFim;
  const palavras = useMemo(() => {
    let i = 0;
    return texto.slice(0, 420).split(/(\s+)/).map((p) => (/^\s+$/.test(p) ? p : Array.from(p).map((c) => ({ c, i: i++, x: (Math.random() - 0.5) * 140, y: -30 - Math.random() * 90, r: (Math.random() - 0.5) * 120, d: Math.random() * 0.25 }))));
  }, [texto]);
  useEffect(() => { const t = setTimeout(() => fim.current(), reduced ? 350 : 1350); return () => clearTimeout(t); }, [reduced]);
  return (
    <div className="x-eu h-quebra" aria-label={texto}>
      {palavras.map((p, k) => typeof p === "string" ? <span key={k}>{p}</span> : (
        <span key={k} className="h-palavra">{p.map((l) => (
          <motion.span key={l.i} style={{ display: "inline-block" }} initial={{ opacity: 1, x: 0, y: 0, rotate: 0, filter: "blur(0px)" }}
            animate={reduced ? { opacity: 0 } : { opacity: 0, x: l.x, y: l.y, rotate: l.r, filter: "blur(5px)" }}
            transition={{ duration: reduced ? 0.25 : 0.75, delay: reduced ? 0 : 0.35 + l.i * 0.0035 + l.d, ease: [0.55, 0, 0.85, 0.35] }}>{l.c}</motion.span>
        ))}</span>
      ))}
    </div>
  );
}

/* Ditado: o navegador transcreve enquanto o gravador grava (o áudio não sai do aparelho). */
type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: (() => void) | null };
const SRClass = (): (new () => SR) | null => { const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }; return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null; };

/* ================================================================= APP */
export function App451() {
  const [me, setMe] = useState<MeX | null>(null);
  const [chave, setChave] = useState(() => getKey() || null);
  const [pagina, setPagina] = useState<Pagina>(() => (uiSalvo().pagina === "imagens" && !new URLSearchParams(location.search).get("q") ? "imagens" : "chat"));
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>(carregarConversas);
  const [ativa, setAtiva] = useState<string | null>(ativaInicial);
  const [confirma, setConfirma] = useState<Confirmacao | null>(null);
  const [modelo, setModeloS] = useState(() => { try { return localStorage.getItem("451-model") || ""; } catch { return ""; } });
  const [agente, setAgente] = useState(false);
  const [arena, setArena] = useState(false);
  /* Raciocínio (baixo/médio/alto): só o 451 Max usa. Alto pensa mais e gasta mais tokens. */
  const [esforco, setEsforco] = useState<"baixo" | "medio" | "alto">(() => { try { const v = localStorage.getItem("451-esforco"); return v === "baixo" || v === "alto" ? v : "medio"; } catch { return "medio"; } });
  const mudarEsforco = (v: "baixo" | "medio" | "alto") => { setEsforco(v); try { localStorage.setItem("451-esforco", v); } catch { /* */ } };
  const [pet, setPetS] = useState<Pet>(() => ler("451-pet", PET0));
  const [prefs, setPrefsS] = useState<Prefs>(() => ler("451-agente", PREFS0));
  petAtual = pet;
  const [gravando, setGravando] = useState(false);
  const [entrar, setEntrar] = useState(false);
  const [upsell, setUpsell] = useState<Upsell | null>(null);
  const [pay, setPay] = useState<{ open: boolean; orderId: string }>(() => { const id = pendingOrderId(); return { open: !!id, orderId: id }; });
  const [breve, setBreve] = useState<string | null>(null);
  const [busca, setBusca] = useState<string | null>(null);
  const [avisouPerto, setAvisouPerto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [menu, setMenu] = useState(false);
  const ladoRef = useRef<HTMLElement>(null);
  const fundoRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef(false); menuRef.current = menu;
  /* Celular: arrastar da borda esquerda abre o menu e ele acompanha o dedo; arrastar para a esquerda fecha. */
  useEffect(() => {
    let ini: { x: number; y: number; t: number; aberto: boolean } | null = null;
    let arrasta = false, pos = 0;
    const lado = () => ladoRef.current, fundo = () => fundoRef.current;
    const comeca = (e: TouchEvent) => {
      if (!celular() || e.touches.length !== 1) return;
      const t = e.touches[0]!, alvo = e.target as HTMLElement;
      const aberto = menuRef.current;
      if (!aberto && t.clientX > 26) return;
      if (aberto && alvo.closest(".h-hist-item, input, textarea")) return;
      if (!aberto && document.querySelector(".m-fundo")) return;
      ini = { x: t.clientX, y: t.clientY, t: Date.now(), aberto }; arrasta = false;
    };
    const move = (e: TouchEvent) => {
      const el = lado(); if (!ini || !el) return;
      const t = e.touches[0]!, dx = t.clientX - ini.x, dy = t.clientY - ini.y;
      if (!arrasta) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; if (Math.abs(dy) > Math.abs(dx)) { ini = null; return; } arrasta = true; el.style.transition = "none"; const f = fundo(); if (f) f.style.transition = "none"; }
      const w = el.offsetWidth;
      pos = ini.aberto ? Math.min(0, dx) : Math.min(0, -w + Math.max(0, dx));
      el.style.transform = `translateX(${pos}px)`;
      const f = fundo(); if (f) { f.style.opacity = String(Math.max(0, 1 + pos / w)); f.style.pointerEvents = "auto"; }
      if (e.cancelable) e.preventDefault();
    };
    const fim = () => {
      const el = lado(); if (!ini || !el) { ini = null; return; }
      if (arrasta) {
        const w = el.offsetWidth, v = (pos - (ini.aberto ? 0 : -w)) / Math.max(1, Date.now() - ini.t);
        const abrir = v > 0.45 ? true : v < -0.45 ? false : pos > -w / 2;
        el.style.transition = ""; el.style.transform = "";
        const f = fundo(); if (f) { f.style.transition = ""; f.style.opacity = ""; f.style.pointerEvents = ""; }
        setMenu(abrir);
      }
      ini = null; arrasta = false;
    };
    window.addEventListener("touchstart", comeca, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", fim);
    window.addEventListener("touchcancel", fim);
    return () => { window.removeEventListener("touchstart", comeca); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", fim); window.removeEventListener("touchcancel", fim); };
  }, []);
  const composer = useRef<ComposerHandle>(null);
  const pendentes = useRef(new Map<number, Pendente>());
  /* Parar (20/11): a resposta em andamento e as imagens sendo geradas no chat. */
  const pararResp = useRef<(() => void) | null>(null);
  const imgCtrls = useRef(new Map<number, AbortController>());
  const anexos = useRef(new Map<number, WireAttachment[]>());
  const sr = useRef<SR | null>(null);
  const transcrito = useRef("");

  /* QA 20/11: sem /api/me (sem internet ou servidor fora) a caixa ficava em "Carregando os modelos" para sempre. */
  const [semConexao, setSemConexao] = useState(false);
  const loadMe = useCallback(() => api.me().then((m) => { setMe(m as MeX); setSemConexao(false); return m as MeX; }).catch(() => { setSemConexao(true); return null; }), []);
  useEffect(() => { const volta = () => void loadMe(); window.addEventListener("online", volta); return () => window.removeEventListener("online", volta); }, [loadMe]);
  useEffect(() => { void loadMe(); }, [loadMe, chave]);
  useEffect(() => { gravar(STORE, conversas.slice(0, 60)); }, [conversas]);
  useEffect(() => { gravar(UI_KEY, { ...uiSalvo(), pagina, ativa }); }, [pagina, ativa]);
  const setPet = (p: Pet) => { setPetS(p); gravar("451-pet", p); };
  const setPrefs = (p: Prefs) => { setPrefsS(p); gravar("451-agente", p); };

  /* conta */
  const tier = me?.tier ?? (me?.plan === "pro" ? "pro" : "free");
  const plano: Plano = tier === "plus" ? "plus" : tier === "pro" ? "pro" : "gratis";
  const pro = plano !== "gratis";
  const conta: Conta = { chave, plano, creditosPlano: me?.credits?.plan ?? 0, avulsos: me?.credits?.extra ?? 0, ate: validadeDa(chave) };
  const saldo = total(conta);

  /* modelos: os do servidor, em grupos */
  const ordem = ["No seu plano", "No Pro", "Com créditos"];
  const modelos: ModelOption[] = (me?.models ?? []).map((m: MeModel) => {
    const credito = m.bucket === "credits" || /^(451|Heretic) (Hermes|Kimi)$/.test(m.name);
    const grupo = credito && !(m.locked && m.bucket !== "credits") ? "Com créditos" : m.locked ? "No Pro" : "No seu plano";
    return { ...m, name: m.name.replace(/^Heretic\b/, "451"), short: m.short.replace(/^Heretic\b|^451\s+/, ""), grupo, badge: credito ? "Créditos" : undefined } as ModelOption;
  }).sort((a, b) => ordem.indexOf(a.grupo!) - ordem.indexOf(b.grupo!));
  const atual = modelos.find((m) => m.id === modelo && !m.locked) ?? modelos.find((m) => !m.locked) ?? modelos[0];
  const setModelo = (id: string) => { setModeloS(id); try { localStorage.setItem("451-model", id); } catch { /* */ } };
  const porCredito = (atual as ModelOption & { bucket?: string } | undefined)?.bucket === "credits";

  /* limite de mensagens: a cota do balde do modelo atual */
  const cota: Quota | undefined = me?.quotas?.find((q) => q.resource === "messages" && q.bucket === (atual as ModelOption & { bucket?: string } | undefined)?.bucket) ?? me?.quotas?.find((q) => q.resource === "messages");
  const dia = cota?.windows.find((w) => w.id === "day") ?? (cota ? tightestWindow(cota) : null);
  LIMITE = dia?.limit || 15;
  RENOVA = quando(cota?.resetAt ?? dia?.resetAt);
  const restam = cota ? Math.max(0, cota.remaining) : LIMITE;
  const usado = dia ? dia.used : 0;
  const temLimite = !pro && !!cota && !porCredito;

  const conv = conversas.find((c) => c.id === ativa) ?? null;
  const msgs = conv?.msgs ?? [];
  const gerandoImg = msgs.some((m) => m.tipo === "img" && !m.src && !m.erro);
  const titulo = conv?.titulo ?? "Nova conversa";
  const patchMsg = (convId: string, id: number, f: (m: Msg) => Msg) => setConversas((l) => l.map((c) => (c.id !== convId ? c : { ...c, msgs: c.msgs.map((m) => (m.id === id ? f(m) : m)) })));
  const addMsg = (m: Msg, titulo0?: string): string => {
    let id = ativa && conversas.some((c) => c.id === ativa) ? ativa : null;
    if (!id) {
      id = `c${nextId++}`;
      const t = (titulo0 ?? "").replace(/\s+/g, " ").trim();
      const nova: Conversa = { id, titulo: t.length > 42 ? t.slice(0, 40).trimEnd() + "…" : t || "Nova conversa", ts: Date.now(), msgs: [m] };
      setConversas((l) => [nova, ...l]);
      setAtiva(id);
      return id;
    }
    const cid = id;
    setConversas((l) => l.map((c) => (c.id !== cid ? c : { ...c, ts: Date.now(), msgs: [...c.msgs, m] })));
    return cid;
  };
  const historico = (lista: Msg[]): WireMsg[] => {
    const out: WireMsg[] = [];
    for (const m of lista) {
      if (m.tipo === "ia" && m.resposta) {
        const files = anexos.current.get(m.id);
        out.push({ role: "user", content: m.pergunta, ...(files ? { attachments: files } : {}) });
        out.push({ role: "assistant", content: m.resposta });
      }
    }
    return out.slice(-24);
  };

  const podeMandar = () => {
    if (!atual) return false;
    if (porCredito && saldo < 3) { setCfg("creditos"); return false; }
    if (temLimite && (restam <= 0 || cota?.blocked)) { setUpsell("acabou"); return false; }
    return true;
  };

  const responder_ = (pergunta: string, opts: { agente?: boolean; files?: WireAttachment[]; texto?: string; semImagem?: boolean } = {}) => {
    if (!atual) return;
    if (!opts.files?.length && !opts.semImagem) {
      const regex = pedidoDeImagem(pergunta);
      if (regex || ultimaImagem() || IMG_PALAVRA.test(pergunta)) { rotearImagem(pergunta, regex, opts); return; }
    }
    const id = nextId++;
    const enhance = !!opts.agente && pro;
    const esf = atual.id === "claude-sonnet-5-5" ? esforco : null;
    const conteudo = opts.texto ?? pergunta;
    pendentes.current.set(id, {
      history: [...historico(msgs), { role: "user", content: conteudo, ...(opts.files?.length ? { attachments: opts.files } : {}) }],
      model: atual.id, enhance, quality: arena && pro, prefs, creditosAntes: saldo, esforco: esf,
    });
    if (opts.files?.length) anexos.current.set(id, opts.files);
    addMsg({ id, tipo: "ia", pergunta, modelo: atual.id, nomeModelo: atual.name, agente: enhance ? "" : undefined }, pergunta);
    setPagina("chat");
  };
  /* Imagem no chat (20/11, no desenho do skynetchat): a imagem pronta ganha a marca do 451 e 3 sugestões de ajuste. */
  const imgPronta = (cid: string, id: number, desc: string) => (r: ImageResult) => {
    patchMsg(cid, id, (m) => ({ ...m, src: r.image, final: r.prompt, token: r.token, creditos: r.creditos || undefined } as Msg));
    void guardarImagem(desc, r).then((g) => { if (g) patchMsg(cid, id, (m) => ({ ...m, galeriaId: g.id } as Msg)); }); void loadMe();
    void api.imageFollowups(desc).then((s) => { if (s.length) patchMsg(cid, id, (m) => ({ ...m, sugestoes: s } as Msg)); });
  };
  const imgFalhou = (cid: string, id: number) => (e: unknown) => {
    const cancelou = imgCtrls.current.get(id)?.signal.aborted;
    patchMsg(cid, id, (m) => ({ ...m, erro: cancelou ? "Você cancelou esta imagem." : erroDeImagem(e), idade: !cancelou && e instanceof ImageError && e.code === "age_required" } as Msg));
  };
  const imgSinal = (id: number) => { const c = new AbortController(); imgCtrls.current.set(id, c); return c.signal; };
  const imgFim = (id: number) => () => { imgCtrls.current.delete(id); };
  const cancelarImagem = (id: number) => imgCtrls.current.get(id)?.abort();
  const gerarImagem = (pergunta: string, desc: string, extra: ImageOpts = {}) => {
    const id = nextId++;
    const p = lerImgPrefs();
    const base = optsDeImagem(p, pro);
    const opts: ImageOpts = { ...base, ...extra, formato: extra.formato ?? (base.formato === "auto" ? "1:1" : base.formato) };
    const cid = addMsg({ id, tipo: "img", pergunta, desc, opts, adulto: opts.estilo === "sem-filtro" }, pergunta);
    api.image(desc, opts, imgSinal(id)).then(imgPronta(cid, id, desc)).catch(imgFalhou(cid, id)).finally(imgFim(id));
  };
  const editarImagem = (pergunta: string, desc: string, refs: ImageRef[], final?: string, adulto?: boolean, base?: string) => {
    const id = nextId++;
    const cid = addMsg({ id, tipo: "img", pergunta, desc, refs, final, adulto, editar: true, base } as Msg, pergunta);
    api.editImage(desc, refs, { final, base, adulto, confirmAge: lerImgPrefs().adulto }, imgSinal(id)).then(imgPronta(cid, id, desc)).catch(imgFalhou(cid, id)).finally(imgFim(id));
  };
  const acoesImg: AcoesImg = {
    cancelar: (m) => cancelarImagem(m.id),
    apagar: (m) => {
      if (m.galeriaId) void apagarImagem(m.galeriaId);
      if (conv) setConversas((l) => l.map((c) => (c.id !== conv.id ? c : { ...c, msgs: c.msgs.filter((x) => x.id !== m.id) })));
    },
    variar: (m) => { if (podeMandar() && m.desc && !m.editar) gerarImagem(`Variar: ${m.desc}`, m.desc, { ...m.opts, final: m.final, seed: undefined }); },
    sugestao: (m, s) => { if (podeMandar() && m.src) editarImagem(s, s, [{ src: m.src, token: m.token }], undefined, m.adulto, m.final); },
    idade: (m) => {
      salvarImgPrefs({ ...lerImgPrefs(), adulto: true });
      if (!podeMandar() || !m.desc) return;
      if (m.editar && m.refs) editarImagem(m.pergunta, m.desc, m.refs, m.final, m.adulto, m.base);
      else gerarImagem(m.pergunta, m.desc, { ...m.opts, confirmAge: true });
    },
  };
  /* Classificador com contexto: só é chamado quando a mensagem pode ser de imagem ou quando há imagem recente. */
  const ultimaImagem = () => [...msgs].slice(-6).reverse().find((m): m is Extract<Msg, { tipo: "img" }> => m.tipo === "img" && !!m.src);
  const contextoImg = () => msgs.slice(-8).flatMap((m): { role: "user" | "assistant"; text: string; img?: boolean }[] =>
    m.tipo === "img" ? [{ role: "user", text: m.pergunta }, { role: "assistant", text: m.final || m.desc || "", img: !!m.src }]
      : m.tipo === "ia" ? [{ role: "user", text: m.pergunta }, { role: "assistant", text: (m.resposta || "").slice(0, 400) }]
        : m.tipo === "audio" ? [{ role: "user", text: m.transcricao }] : []);
  const rotearImagem = (pergunta: string, regex: string | null, opts: { agente?: boolean; files?: WireAttachment[]; texto?: string }) => {
    const recente = ultimaImagem();
    api.imageIntent(pergunta, contextoImg(), !!recente, AbortSignal.timeout(12000)).then((r) => {
      const p = lerImgPrefs();
      const formato = p.formato !== "auto" ? p.formato : (r.formato || "1:1") as ImageFormato;
      if (r.intent === "bloqueado") { const id = nextId++; addMsg({ id, tipo: "img", pergunta, erro: r.message || "Esse pedido não dá." }, pergunta); return; }
      if (r.intent === "edit_image" && recente?.src) { editarImagem(pergunta, pergunta, [{ src: recente.src, token: recente.token }], r.prompt, r.adulto, recente.final); return; }
      if (r.intent === "new_image") {
        gerarImagem(pergunta, regex || pergunta, r.adulto ? { estilo: "sem-filtro", confirmAge: p.adulto, final: r.prompt, formato } : { final: r.prompt, formato });
        return;
      }
      responder_(pergunta, { ...opts, semImagem: true });
    }).catch(() => {
      if (regex) gerarImagem(pergunta, regex);
      else if (recente?.src && pergunta.length <= 200 && EDIT_VERBO.test(pergunta)) editarImagem(pergunta, pergunta, [{ src: recente.src, token: recente.token }], undefined, recente.adulto, recente.final);
      else responder_(pergunta, { ...opts, semImagem: true });
    });
  };

  const enviar = (texto: string, files: WireAttachment[] = [], completo?: string) => {
    if ((!texto.trim() && !files.length) || !podeMandar()) return;
    setPagina("chat");
    const usarAgente = agente && pro && (prefs.quando !== "curtos" || texto.length <= 220);
    if (usarAgente && !files.length) {
      addMsg({ id: nextId++, tipo: "quebrando", original: texto }, texto);
      return;
    }
    responder_(texto || "Analise o anexo.", { agente: usarAgente, files, texto: completo });
  };
  const quebrou = (cid: string, id: number, original: string) => {
    setConversas((l) => l.map((c) => (c.id !== cid ? c : { ...c, msgs: c.msgs.filter((x) => x.id !== id) })));
    responder_(original, { agente: true });
  };
  const submit = (p: SubmitPayload) => {
    const files = wireAttachments(p);
    const completo = withAttachments(p);
    enviar(p.text.trim() || (files.length || completo ? "Analise o anexo." : ""), files, completo !== p.text.trim() ? completo : undefined);
  };

  /* resposta em andamento: liga o /api/chat ao AiAnswer */
  const criarResponder = (cid: string, id: number): Responder | undefined => {
    const p = pendentes.current.get(id);
    if (!p) return undefined;
    return async function* ({ signal }) {
      const fila: Evento[] = [];
      let acorda: (() => void) | null = null, fim = false, erro: Error | null = null, enviado = "", texto = "";
      const push = (e: Evento) => { fila.push(e); acorda?.(); };
      const t0 = Date.now();
      setOcupado(true);
      const ctrl = streamChat(
        { conversationId: 0, mode: "chat", model: p.model, messages: p.history, quality: p.quality, enhance: p.enhance, ...(p.enhance ? { agentPrefs: p.prefs } : {}), ...(p.esforco ? { effort: p.esforco } : {}), params: { temperature: 0.6, top_p: 0.9, max_tokens: 4096 } } as Parameters<typeof streamChat>[0],
        {
          onToken: (full) => {
            texto = visivel(full);
            // Segura os primeiros 160 caracteres: se o servidor descartar uma recusa, nada dela chega à tela.
            if (texto.length < 160) return;
            if (texto.startsWith(enviado)) { const d = texto.slice(enviado.length); enviado = texto; if (d) push({ type: "text", text: d }); }
          },
          onRefusalForced: () => { texto = ""; },
          onEnhanced: (_o, t) => patchMsg(cid, id, (m) => ({ ...m, agente: t } as Msg)),
          onWarning: (d) => {
            const w = d as { type?: string; query?: string; sources?: { url: string; title: string; snippet?: string }[]; answers?: { model: string; text: string }[]; recommended?: number; reason?: string };
            if (w.type === "search" && w.query) push({ type: "reasoning", text: `Buscando na web: ${w.query}. ` });
            else if (w.type === "sources" && Array.isArray(w.sources)) {
              const fontes: Source[] = w.sources.slice(0, 8).map((s, i) => { let dom = s.url; try { dom = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* */ } return { id: String(i + 1), title: s.title || dom, site: dom, domain: dom, url: s.url, date: "", snippet: s.snippet }; });
              push({ type: "sources", sources: fontes });
              // Guarda as fontes na conversa: depois de recarregar, os [1] [2] da resposta continuam virando links.
              patchMsg(cid, id, (m) => ({ ...m, fontes } as Msg));
            }
            else if (w.type === "arena" && Array.isArray(w.answers) && w.answers.length === 2) patchMsg(cid, id, (m) => ({ ...m, arena: { answers: w.answers!, recommended: w.recommended === 1 ? 1 : 0, reason: w.reason || "" } } as Msg));
            else if (w.type === "quality" && typeof (w as { message?: string }).message === "string") push({ type: "reasoning", text: `${(w as { message: string }).message} ` });
            // Roteador: pedido direto não passa pelo Max. Diz na tela, sem anunciar como aviso.
            else if (w.type === "rerouted_pre" && w.reason) push({ type: "reasoning", text: `${w.reason} ` });
          },
          onUsage: () => { /* o /api/me abaixo traz os números novos */ },
          onError: (message, info) => {
            if (parado) return;
            erro = new Error(message);
            patchMsg(cid, id, (m) => ({ ...m, resposta: "", erro: message } as Msg));
            if (info?.status === 429 && !pro) setUpsell("acabou");
            if (info?.status === 402) setCfg("creditos");
            if (info?.status === 403) void loadMe();
            fim = true; acorda?.();
          },
          onDone: (content) => {
            if (parado) return;
            const final = visivel(content || texto);
            if (final.startsWith(enviado) && final.length > enviado.length) push({ type: "text", text: final.slice(enviado.length) });
            enviado = final;
            patchMsg(cid, id, (m) => ({ ...m, resposta: final } as Msg));
            fim = true; acorda?.();
            void loadMe().then((novo) => {
              const depois = (novo?.credits?.total ?? 0);
              const custo = Math.max(0, p.creditosAntes - depois);
              const q = novo?.quotas?.find((x) => x.resource === "messages" && x.bucket === (novo.models.find((mm) => mm.id === p.model)?.bucket));
              const n = !pro && q ? (q.windows.find((w) => w.id === "day") ?? tightestWindow(q))?.used : undefined;
              patchMsg(cid, id, (m) => ({ ...m, resposta: final, custo, numero: n } as Msg));
              if (!pro && q && q.remaining <= 3 && q.remaining > 0) setAvisouPerto((v) => { if (!v) setTimeout(() => setUpsell("perto"), 2600); return true; });
            });
          },
        },
      );
      signal.addEventListener("abort", () => { ctrl.abort(); fim = true; acorda?.(); });
      let parado = false;
      const parar = () => {
        parado = true; ctrl.abort();
        // Mostra o que já chegou (os primeiros 160 caracteres ficam guardados até passar do filtro de recusa).
        if (texto.startsWith(enviado) && texto.length > enviado.length) { push({ type: "text", text: texto.slice(enviado.length) }); enviado = texto; }
        fim = true; acorda?.();
      };
      pararResp.current = parar;
      try {
        while (true) {
          while (fila.length) yield fila.shift()!;
          if (fim) break;
          await new Promise<void>((r) => { acorda = r; });
          acorda = null;
        }
        while (fila.length) yield fila.shift()!;
      } finally {
        pendentes.current.delete(id);
        if (pararResp.current === parar) pararResp.current = null;
        setOcupado(false);
      }
      if (parado) { patchMsg(cid, id, (m) => ({ ...m, resposta: enviado, parada: true } as Msg)); return; }
      if (erro) throw erro;
      if (signal.aborted) { patchMsg(cid, id, (m) => ({ ...m, resposta: enviado } as Msg)); return; }
      yield { type: "done", seconds: Math.round((Date.now() - t0) / 1000) };
    };
  };

  /* áudio: grava com o VoiceRecorder e o navegador transcreve junto */
  const podeAudio = typeof window !== "undefined" && !!SRClass() && !!navigator.mediaDevices?.getUserMedia;
  const comecarAudio = () => {
    const C = SRClass();
    if (!C) return;
    transcrito.current = "";
    try {
      const r = new C();
      r.lang = "pt-BR"; r.continuous = true; r.interimResults = true;
      r.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i]![0]!.transcript; transcrito.current = t.trim(); };
      r.onerror = () => { /* segue gravando; sem texto o envio avisa */ };
      r.start(); sr.current = r;
    } catch { sr.current = null; }
    setGravando(true);
  };
  const pararAudio = () => { try { sr.current?.stop(); } catch { /* */ } sr.current = null; };
  const audioEnviado = (audio: VoiceMessage) => {
    pararAudio();
    setGravando(false);
    window.setTimeout(() => {
      const t = transcrito.current;
      if (!t) { composer.current?.fill(""); window.alert("Não entendi o áudio. Tente falar mais perto do microfone."); return; }
      if (!podeMandar()) return;
      addMsg({ id: nextId++, tipo: "audio", audio, transcricao: t }, t);
      window.setTimeout(() => responder_(t, { agente: agente && pro }), 500);
    }, 400);
  };

  const novaConversa = () => { setAtiva(null); setPagina("chat"); setBusca(null); };
  const apagarConversa = (id: string) => { setConversas((l) => l.filter((c) => c.id !== id)); if (ativa === id) setAtiva(null); };
  const comprar = (c: Compra) => {
    setUpsell(null);
    if (c.tipo === "plano" && c.plano === "pro") { setPay({ open: true, orderId: "" }); return; }
    setBreve(c.tipo === "creditos" ? "A compra de créditos avulsos ainda não abriu. Por enquanto, os créditos vêm com o Pro (500 por mês)." : "O Pro Plus ainda não está à venda. Por enquanto, assine o Pro.");
  };
  const sair = () => { setKey(""); setChave(null); setCfg(null); setAgente(false); setArena(false); };
  const entrou = (k: string) => { setKey(k); setChave(k); };

  /* ?q= da landing manda na hora; ?buy=1 abre o Pro; ?key=1 abre o Entrar */
  const inicial = useRef(false);
  useEffect(() => {
    if (inicial.current || !me) return;
    inicial.current = true;
    const p = new URLSearchParams(location.search);
    const q = p.get("q");
    if (q || p.get("buy") || p.get("key")) history.replaceState(null, "", location.pathname);
    if (q) enviar(q);
    if (p.get("buy") === "1") setPay({ open: true, orderId: "" });
    if (p.get("key") === "1" && !getKey()) setEntrar(true);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Ctrl K abre a busca no histórico */
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setBusca((b) => (b === null ? "" : null)); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  /* janela de limite zerou: atualiza sem recarregar */
  const bloqueadoAte = cota?.blocked ? cota.resetAt : null;
  useEffect(() => {
    if (!bloqueadoAte) return;
    const t = window.setTimeout(() => void loadMe(), Math.min(Math.max(1000, bloqueadoAte - Date.now() + 1500), 2_000_000_000));
    return () => window.clearTimeout(t);
  }, [bloqueadoAte, loadMe]);

  const grupos = useMemo(() => {
    const f = (busca ?? "").toLowerCase();
    const lista = [...conversas].sort((a, b) => b.ts - a.ts).filter((c) => !f || c.titulo.toLowerCase().includes(f) || c.msgs.some((m) => "pergunta" in m && m.pergunta.toLowerCase().includes(f)));
    const g = new Map<string, Conversa[]>();
    for (const c of lista) { const k = grupoDe(c.ts); g.set(k, [...(g.get(k) ?? []), c]); }
    return [...g.entries()];
  }, [conversas, busca]);

  const tituloTopo = pagina === "chat" ? titulo : "Imagens";

  return (
    <div className="x-row x-h">
      <div ref={fundoRef} className="h-menu-fundo" data-aberta={menu || undefined} onClick={() => setMenu(false)} aria-hidden="true" />
      <aside ref={ladoRef} className="a-side" data-aberta={menu || undefined} onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) setMenu(false); }}>
        <div className="a-brand"><span className="x-logo"><Cig s={26} />451<small>.sh</small></span></div>
        <nav className="a-nav h-nav">
          <a data-on={(pagina === "chat" && !conv) || undefined} onClick={novaConversa}><Plus size={18} />Nova conversa</a>
          <a data-on={busca !== null || undefined} onClick={() => setBusca((b) => (b === null ? "" : null))}><Search size={18} />Buscar<span className="x-mono x-mu h-atalho">Ctrl K</span></a>
          <a data-on={pagina === "imagens" || undefined} onClick={() => setPagina("imagens")}><ImageIcon size={18} />Imagens</a>
        </nav>
        {busca !== null && <input className="m-campo h-input h-busca" autoFocus placeholder="Buscar nas conversas" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setBusca(null)} aria-label="Buscar nas conversas" />}
        <div className="a-hist">
          {grupos.length === 0 ? <p className="x-mu h-hist-vazio">{busca ? "Nada encontrado." : "Suas conversas ficam aqui, só neste aparelho."}</p> : grupos.map(([g, l]) => (
            <div key={g}><p>{g}</p>{l.map((c) => (
              <HistItem key={c.id} titulo={c.titulo} on={pagina === "chat" && ativa === c.id} abrir={() => { setAtiva(c.id); setPagina("chat"); setMenu(false); }} apagar={() => apagarConversa(c.id)} />
            ))}</div>
          ))}
        </div>
        <a className="h-cfg-link" onClick={() => setCfg(conta.chave ? "chave" : "planos")}><Settings size={17} />Configurações</a>
        <CartaoPlano conta={conta} usado={usado} restam={restam} saldo={saldo} usoJusto={me?.fairUse ?? null} assinar={() => comprar({ tipo: "plano", plano: "pro", periodo: "mensal" })} creditos={() => setCfg("creditos")} />
        <div className="h-rodape-lat">
          {conta.chave ? (
            <a className="h-conta" onClick={() => setCfg("chave")} title="Abrir configurações">
              <span className="h-conta-id"><span className="x-mono">{conta.chave.slice(0, 4)}…{conta.chave.slice(-4)}</span><small>Plano {nomePlano(conta.plano)}</small></span>
              <span className="h-conta-cred"><b className="x-mono">{num(saldo)}</b><small>créditos</small></span>
              <Settings size={16} className="x-mu" />
            </a>
          ) : (
            <div className="h-conta sem">
              <a className="h-conta-sem" onClick={() => setCfg("chave")} title="Abrir configurações"><span>Sem chave<small>Grátis, sem conta</small></span></a>
              <button className="h-entrar" onClick={() => setEntrar(true)}><KeyRound size={14} />Entrar</button>
            </div>
          )}
        </div>
      </aside>

      <main className="x-col x-grow h-main" data-cowork={(agente && pro) || undefined}>
        <header className="a-top">
          <button className="x-ib h-menu-btn" aria-label="Abrir o menu" onClick={() => setMenu(true)}><Menu size={19} /></button>
          {pagina !== "chat" && <button className="x-ib" aria-label="Voltar ao chat" onClick={() => setPagina("chat")}><ArrowLeft size={18} /></button>}
          <span className="h-titulo">{tituloTopo}</span><span className="x-sp" />
          {pagina === "chat" && conv && <button className="x-ib h-apagar-conv" aria-label="Apagar esta conversa" title="Apagar esta conversa"
            onClick={() => setConfirma({ titulo: "Apagar esta conversa?", texto: "Ela some deste aparelho e não dá para desfazer.", botao: "Apagar conversa", acao: () => apagarConversa(conv.id) })}><Trash2 size={17} /></button>}
          {pro && <button className="x-pill h-pill-btn" onClick={() => setCfg("creditos")} title="Saldo de créditos"><Coins size={13} />{num(saldo)} créditos</button>}
          <a href={xIntent} target="_blank" rel="noreferrer" className="h-suporte-topo" title={`Abre um post no X marcando @${X_HANDLE}`}><LogoX s={13} />Suporte</a>
        </header>

        {/* As duas páginas ficam montadas: trocar de aba não perde a resposta em andamento, a imagem
            sendo gerada nem a posição da conversa. A escondida fica invisível e fora do foco. */}
        <div className="h-paginas">
        <Pagina on={pagina === "chat"} lado={-28}>
          <div className="x-col x-grow">
            {msgs.length === 0 ? (
              <div className="hx-start hx-start-burn h-burn">
                <StartBurn suggestions={SUGESTOES} onPick={(t) => enviar(t)} go={<ArrowRight className="hx-burn-go" aria-hidden="true" />}
                  composer={<>{caixa("Manda o alvo. Nada aqui pede licença")}{temLimite && <p className={`h-uso ${restam <= 3 ? "x-warn" : ""}`}>{usado} de {LIMITE} mensagens hoje{usado > 0 && RENOVA !== "em breve" ? ` · renova ${RENOVA}` : ""}</p>}</>} />
              </div>
            ) : (
              <>
                <MessageScroller className="h-scroller" viewportClassName="h-scroll-vp" contentClassName="x-w760 x-thread" navigation="rail" label="Conversa" railClassName="h-rail"
                  labels={{ navigationLabel: "Ir para mensagem", preview: "Mensagem", goToUser: "Ir para a sua mensagem {index} de {total}", goToAssistant: "Ir para a resposta {index} de {total}", goToMessage: "Ir para a mensagem {index} de {total}" }}>
                  {msgs.map((m) => (
                    <div key={m.id} data-slot="message" data-from={m.tipo === "ia" || m.tipo === "img" ? "assistant" : "user"}>
                      <Item m={m} pro={pro} img={acoesImg} respond={conv && m.tipo === "ia" && m.resposta === undefined ? criarResponder(conv.id, m.id) : undefined}
                        quebrou={(id, o) => conv && quebrou(conv.id, id, o)} onFollowUp={(q) => enviar(q)}
                        onArena={(i) => conv && m.tipo === "ia" && m.arena && patchMsg(conv.id, m.id, (x) => ({ ...x, resposta: (x as Extract<Msg, { tipo: "ia" }>).arena!.answers[i]?.text ?? (x as Extract<Msg, { tipo: "ia" }>).resposta } as Msg))} />
                    </div>
                  ))}
                </MessageScroller>
                <div className="x-foot h-foot"><div className="h-fumaca" aria-hidden="true" /><div className="x-w760 x-gap10 h-foot-in">
                  {temLimite && restam <= 3 && <AvisoLimite usado={usado} restam={restam} assinar={() => comprar({ tipo: "plano", plano: "pro", periodo: "mensal" })} />}
                  {caixa("Próximo alvo. Manda")}
                  <p className="h-rodape">O 451 não tem censura. Você é responsável pelo que pede e pelo que faz com a resposta. · <a href={xIntent} target="_blank" rel="noreferrer"><LogoX s={11} /> Feedback para @{X_HANDLE}</a></p>
                </div></div>
              </>
            )}
          </div>
        </Pagina>
        <Pagina on={pagina === "imagens"} lado={28}>
          <PaginaImagens ativa={pagina === "imagens"} pro={pro} aoGerar={() => void loadMe()} onUpsell={() => setUpsell("modelo")} confirmar={setConfirma} />
        </Pagina>
        </div>
      </main>

      <AnimatePresence>
        {entrar && <ModalEntrar key="entrar" onClose={() => setEntrar(false)} onEntrar={entrou} assinar={() => { setEntrar(false); comprar({ tipo: "plano", plano: "pro", periodo: "mensal" }); }} />}
        {cfg && <ModalConfig key="cfg" pet={pet} setPet={setPet} prefs={prefs} setPrefs={setPrefs} aba={cfg} setAba={setCfg} ativo={!pay.open && !entrar && !breve} onClose={() => setCfg(null)} conta={conta} usado={usado} restam={restam} me={me} comprar={comprar} sair={sair} entrar={() => setEntrar(true)} />}
        {confirma && <Modal key="confirma" label={confirma.titulo} onClose={() => setConfirma(null)}><div><h2 className="m-h">{confirma.titulo}</h2><p className="x-tx2">{confirma.texto}</p></div>
          <div className="h-confirma-acoes"><button className="x-btn g" onClick={() => setConfirma(null)}>Cancelar</button><button className="x-btn p" onClick={() => { confirma.acao(); setConfirma(null); }}><Trash2 size={15} />{confirma.botao}</button></div></Modal>}
        {upsell && <ModalUpsell key="upsell" motivo={upsell} restam={restam} onClose={() => setUpsell(null)} comprar={comprar} />}
        {breve && <Modal key="breve" label="Em breve" onClose={() => setBreve(null)}><div><h2 className="m-h">Em breve</h2><p className="x-tx2">{breve}</p></div><button className="x-btn p wide" onClick={() => { setBreve(null); setPay({ open: true, orderId: "" }); }}>Assinar o Pro · R$ 59,90</button></Modal>}
      </AnimatePresence>
      <PayDialog open={pay.open} orderId={pay.orderId} onOpenChange={(open) => setPay((p) => ({ open, orderId: open ? p.orderId : "" }))} onPaid={() => { setChave(getKey() || null); void loadMe(); }} />

      <AnimatePresence>{agente && pro && <Cowork key="cowork" pet={pet} msgs={msgs} enviar={(t) => { if (podeMandar()) responder_(t, { agente: true }); }} preencher={(t) => composer.current?.fill(t)} desligar={() => setAgente(false)} />}</AnimatePresence>
    </div>
  );

  function caixa(ph: string) {
    if (gravando) {
      return (
        <div className="h-gravador">
          <VoiceRecorder hideThread autoStart maxDuration={120} label="Gravar áudio para o 451" onCancel={() => { pararAudio(); setGravando(false); }} onSend={audioEnviado} />
          <p className="h-grav-nota">O navegador transcreve o áudio e só o texto vai para o modelo. <span className="x-mu">Esc cancela.</span></p>
        </div>
      );
    }
    if (!atual) return semConexao
      ? <div className="h-carregando h-sem-conexao" role="alert"><p>Sem conexão com o 451. Confira a internet.</p><button className="x-btn sm" onClick={() => void loadMe()}>Tentar de novo</button></div>
      : <div className="h-carregando"><TextShimmer>Carregando os modelos</TextShimmer></div>;
    return (
      <Composer ref={composer} models={modelos} model={atual}
        onModel={setModelo}
        onLockedModel={(id) => (modelos.find((m) => m.id === id) as ModelOption & { bucket?: string } | undefined)?.bucket === "credits" ? setCfg(pro ? "creditos" : "planos") : setUpsell("modelo")}
        busy={ocupado || gerandoImg} placeholder={ph} onSubmit={submit}
        onStop={() => { pararResp.current?.(); for (const m of msgs) if (m.tipo === "img" && !m.src && !m.erro) cancelarImagem(m.id); }}
        blocked={temLimite && restam <= 0 ? `Volta ${RENOVA}` : null}
        richFiles={atual.tier === "pro" && !atual.locked}
        attachLeft={{ images: me?.quotas?.find((q) => q.resource === "image_upload")?.remaining ?? 0, files: me?.quotas?.find((q) => q.resource === "files")?.remaining ?? 0 }}
        enhanceIcon={<PlushPet bicho={pet.bicho} cor={pet.cor} size={28} ativo={agente && pro} />} enhanceLabel={pet.nome}
        enhanceAvailable onEnhance={() => (pro ? setAgente((a) => !a) : setUpsell("agente"))} enhance={agente && pro} enhanceLocked={!pro}
        effortAvailable={atual.id === "claude-sonnet-5-5"} effort={esforco} onEffort={mudarEsforco}
        qualityAvailable onQuality={() => (pro ? setArena((a) => !a) : setUpsell("arena"))} quality={arena && pro} qualityLocked={!pro} />
    );
  }
}

type Confirmacao = { titulo: string; texto: string; botao: string; acao: () => void };
/* Página que entra deslizando e, ao sair, só fica invisível (continua montada). */
function Pagina({ on, lado, children }: { on: boolean; lado: number; children: ReactNode }) {
  const reduzir = useReducedMotion();
  return (
    <motion.div className="x-col h-pagina" data-on={on || undefined} aria-hidden={!on || undefined} inert={!on}
      initial={false}
      animate={on ? { opacity: 1, x: 0, visibility: "visible" } : { opacity: 0, x: reduzir ? 0 : lado, transitionEnd: { visibility: "hidden" } }}
      transition={{ type: "spring", duration: 0.35, bounce: 0 }}>
      {children}
    </motion.div>
  );
}

/* Conversa no histórico. No celular, arrastar para a esquerda mostra "Apagar" (sem hover no toque). */
function HistItem({ titulo, on, abrir, apagar }: { titulo: string; on: boolean; abrir: () => void; apagar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const arrastou = useRef(false);
  return (
    <div className="h-hist-wrap" data-aberto={aberto || undefined}>
      <button className="h-hist-apagar" onClick={(e) => { e.stopPropagation(); apagar(); }} tabIndex={aberto ? 0 : -1}><Trash2 size={15} />Apagar</button>
      <motion.a className="h-hist-item" data-on={on || undefined} title={titulo}
        drag={celular() ? "x" : false} dragConstraints={{ left: -92, right: 0 }} dragElastic={0.12} dragMomentum={false}
        animate={{ x: aberto ? -92 : 0 }} transition={{ type: "spring", duration: 0.32, bounce: 0.1 }}
        onDragStart={() => { arrastou.current = true; }}
        onDragEnd={(_e, i) => { setAberto(i.offset.x < -46 || i.velocity.x < -400); setTimeout(() => { arrastou.current = false; }, 50); }}
        onClick={(e) => { e.stopPropagation(); if (arrastou.current) return; if (aberto) { setAberto(false); return; } abrir(); }}>
        <span>{titulo}</span>
        <button className="h-hist-del" aria-label={`Apagar ${titulo}`} title="Apagar" onClick={(e) => { e.stopPropagation(); apagar(); }}><Trash2 size={13} /></button>
      </motion.a>
    </div>
  );
}

/* ---------------------------------------------------------------- imagens geradas (no aparelho) */
/* Imagem v2 (20/11): galeria no IndexedDB (cabe muito mais que o localStorage), até 60 imagens. */
const IMG_STORE = "451-imagens"; // lista antiga no localStorage: migra uma vez
const IMG_MAX = 100;
type ImgItem = { id: string; prompt: string; src: string; ts: number; token?: string; final?: string; seed?: number; estilo?: ImageEstilo; formato?: ImageFormato; hd?: boolean; sugestoes?: string[]; creditos?: number };
let dbP: Promise<IDBDatabase> | null = null;
function imgDb(): Promise<IDBDatabase> {
  if (!dbP) dbP = new Promise((ok, falha) => {
    const r = indexedDB.open("451-galeria", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("imagens", { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { dbP = null; falha(r.error); };
  });
  return dbP;
}
function imgTx<T>(modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return imgDb().then((db) => new Promise<T>((ok, falha) => { const q = f(db.transaction("imagens", modo).objectStore("imagens")); q.onsuccess = () => ok(q.result); q.onerror = () => falha(q.error); }));
}
async function listarImagens(): Promise<ImgItem[]> {
  try {
    const antigas = JSON.parse(localStorage.getItem(IMG_STORE) || "null") as { prompt: string; src: string; ts: number }[] | null;
    if (antigas) { for (const a of antigas) await imgTx("readwrite", (s) => s.put({ id: `old-${a.ts}`, ...a })); localStorage.removeItem(IMG_STORE); }
  } catch { /* */ }
  try { return ((await imgTx("readonly", (s) => s.getAll())) as ImgItem[]).sort((a, b) => b.ts - a.ts); } catch { return []; }
}
async function guardarImagem(prompt: string, r: ImageResult, hd = false): Promise<ImgItem | null> {
  const item: ImgItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, prompt, src: r.image, ts: Date.now(), token: r.token, final: r.prompt, seed: r.seed, estilo: r.estilo, formato: r.formato, hd, creditos: r.creditos || undefined };
  try {
    await imgTx("readwrite", (s) => s.put(item));
    const todas = await listarImagens();
    for (const velha of todas.slice(IMG_MAX)) await imgTx("readwrite", (s) => s.delete(velha.id));
    return item;
  } catch { return null; }
}
const apagarImagem = (id: string) => imgTx("readwrite", (s) => s.delete(id)).catch(() => undefined);
const atualizarImagem = (i: ImgItem) => imgTx("readwrite", (s) => s.put(i)).catch(() => undefined);
/* Conversa da página Imagens: só a ordem dos ids. Apagar a conversa não apaga as imagens da Galeria. */
const IMG_CONVERSA = "451-imagem-conversa";
function lerConversaImg(): string[] | null { try { const v = JSON.parse(localStorage.getItem(IMG_CONVERSA) || "null"); return Array.isArray(v) ? v : null; } catch { return null; } }
const gravarConversaImg = (ids: string[]) => { try { localStorage.setItem(IMG_CONVERSA, JSON.stringify(ids.slice(-IMG_MAX))); } catch { /* */ } };

const IMG_PREFS = "451-imagem-prefs";
type ImgPrefs = { estilo: ImageEstilo; formato: ImageFormato; melhorar: boolean; adulto: boolean };
function lerImgPrefs(): ImgPrefs {
  const p: ImgPrefs = { estilo: "rapido", formato: "auto", melhorar: true, adulto: false };
  try { return { ...p, ...JSON.parse(localStorage.getItem(IMG_PREFS) || "{}") }; } catch { return p; }
}
const salvarImgPrefs = (p: ImgPrefs) => { try { localStorage.setItem(IMG_PREFS, JSON.stringify(p)); } catch { /* */ } };
/* Um modelo só, o 451 Image (20/11): o agente sempre reescreve o pedido e o servidor escolhe o motor. Pedido
   adulto vai sozinho para o motor sem filtro (Pro, com 18+ confirmado); o resto vai para o motor padrão. */
function optsDeImagem(p: ImgPrefs, _pro?: boolean): ImageOpts {
  return { estilo: "rapido", formato: p.formato, melhorar: true, ...(p.adulto ? { confirmAge: true } : {}) };
}
function erroDeImagem(e: unknown): string {
  if (e instanceof LimitError) return `Acabaram as imagens por agora. Voltam ${quando(e.quota.resetAt)}.`;
  if (e instanceof ImageError && ["blocked", "pro_only", "age_required", "nsfw_edit_upload", "no_credits"].includes(e.code) && e.message) return e.message;
  return "Não consegui gerar a imagem agora. Tente de novo.";
}
const nomeArquivo = (src: string) => `451-imagem-${Date.now()}.${/^data:image\/(\w+)/.exec(src)?.[1] === "jpeg" ? "jpg" : /^data:image\/(\w+)/.exec(src)?.[1] || "png"}`;

/* ---------------------------------------------------------------- itens do chat */
type ImgMsg = Extract<Msg, { tipo: "img" }>;
type AcoesImg = { cancelar: (m: ImgMsg) => void; variar: (m: ImgMsg) => void; sugestao: (m: ImgMsg, s: string) => void; idade: (m: ImgMsg) => void; apagar: (m: ImgMsg) => void };
function Item({ m, pro, respond, quebrou, onFollowUp, onArena, img }: { m: Msg; pro: boolean; respond?: Responder; quebrou: (id: number, o: string) => void; onFollowUp: (q: string) => void; onArena: (i: number) => void; img: AcoesImg }) {
  if (m.tipo === "quebrando") return <Quebrando texto={m.original} onFim={() => quebrou(m.id, m.original)} />;
  if (m.tipo === "audio") return (
    <div className="h-audio">
      <ol className="h-audio-ol"><MessageRow message={m.audio} layoutId={`a-${m.id}`} /></ol>
      <p className="h-transc"><span className="x-cap">TRANSCRIÇÃO</span> {m.transcricao}</p>
    </div>
  );
  if (m.tipo === "img") return (
    <div className="h-img-msg">
      <div className="x-eu h-eu-curto">{m.pergunta}</div>
      {m.src ? <img className="h-img-gerada" src={m.src} alt={m.pergunta} /> : m.erro ? <p className={m.idade ? "x-tx2" : "h-erro"}>{m.idade ? "O pedido tem nudez entre adultos. Confirme que você tem 18 anos ou mais para gerar." : m.erro}</p> : <div className="h-img-acoes"><p className="h-juiz-espera"><TextShimmer>{m.editar ? "Editando a imagem" : "Gerando a imagem"}</TextShimmer></p>
        <button className="x-btn sm g h-cancelar" onClick={() => img.cancelar(m)}><Fechar size={15} />Cancelar</button></div>}
      {m.idade && !m.src && <button className="x-btn sm h-img-idade-btn" onClick={() => img.idade(m)}>Tenho 18 anos ou mais</button>}
      {m.src && <div className="h-img-acoes">
        <a className="x-btn sm" href={m.src} download={nomeArquivo(m.src)}><Download size={15} />Baixar</a>
        {m.desc && !m.editar && <button className="x-btn sm g" onClick={() => img.variar(m)}><RefreshCw size={15} />Variar</button>}
        <button className="x-btn sm g" onClick={() => img.apagar(m)}><Trash2 size={15} />Apagar</button>
        {!!m.creditos && <span className="x-mono x-mu h-img-cred" title="A cota de imagens do plano acabou: esta saiu dos créditos">{m.creditos} créditos</span>}
      </div>}
      {m.src && !!m.sugestoes?.length && <div className="x-chips h-img-sug">{m.sugestoes.map((s) => <button key={s} className="x-chip" onClick={() => img.sugestao(m, s)}>{s}</button>)}</div>}
    </div>
  );
  return <ItemIa m={m} pro={pro} respond={respond} onFollowUp={onFollowUp} onArena={onArena} />;
}

/* Resposta da IA: a linha de gasto só aparece quando a resposta termina (Ryan, 19/11). */
function ItemIa({ m, respond, onFollowUp, onArena }: { m: Extract<Msg, { tipo: "ia" }>; pro: boolean; respond?: Responder; onFollowUp: (q: string) => void; onArena: (i: number) => void }) {
  /* O responder é fixado na montagem: depois que a resposta termina, a mesma caixa continua na tela. */
  const [resp] = useState(() => respond);
  const pronto = m.resposta !== undefined;
  const modelos = [{ id: m.modelo, name: m.nomeModelo, mark: "451" }];
  const resposta = resp
    ? <AiAnswer bare className="x-answer" models={modelos} question={m.pergunta} respond={resp} onFollowUp={onFollowUp} />
    : m.erro && !m.resposta ? null
      : <AiAnswer bare className="x-answer" models={modelos} question={m.pergunta} answer={m.resposta || ""} sources={m.fontes} followUps={[]} onFollowUp={onFollowUp} />;
  const gasto = !pronto || (m.erro && !m.resposta) ? null : (
    <p className="h-gasto x-mono"><Cig s={14} />{m.nomeModelo} · {m.custo ? `${m.custo} créditos (${reais(m.custo / 100)})` : "0 créditos"}{m.numero ? ` · mensagem ${m.numero} de ${LIMITE} hoje` : ""}{m.agente !== undefined ? ` · ${petAtual.nome}: grátis no Pro` : ""}</p>
  );
  const erro = m.erro ? <p className="h-erro h-erro-resp">{m.erro}</p> : m.parada ? <p className="x-tx2 h-parada">{m.resposta ? "Você parou esta resposta. Ela pode estar incompleta." : "Você parou esta resposta antes de começar."}</p> : null;
  /* A caixa da resposta fica sempre no mesmo lugar da árvore: se remontar, o pedido ao servidor recomeça. */
  const corpo = <>{m.arena ? <Arena id={m.id} pergunta={m.pergunta} arena={m.arena} nome={m.nomeModelo} onPick={onArena} /> : null}<div hidden={!!m.arena}>{resposta}</div></>;
  return (
    <motion.div className={m.agente !== undefined ? "h-pedido-ag" : undefined} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}>
      {m.agente !== undefined && <span className="h-pedido-tag" title={`Pedido de ${petAtual.nome}`}><PlushPet bicho={petAtual.bicho} cor={petAtual.cor} size={18} />{petAtual.nome}</span>}
      {m.agente !== undefined && (m.agente ? <details className="h-cromo-pedido"><summary>{`Ver o pedido de ${petAtual.nome}`}</summary><Markdown text={m.agente} /></details>
        : !pronto ? <div className="h-afinando"><Crosshair size={16} /><TextShimmer>{`${petAtual.nome} está afinando seu pedido`}</TextShimmer></div> : null)}
      {corpo}
      {erro}
      {gasto}
    </motion.div>
  );
}

/* Arena: o componente de produção (ArenaAnswers → ModelArena da ryan-ui) + o veredito do juiz embaixo (Ryan, 19/11). */
function Arena({ id, pergunta, arena, nome, onPick }: { id: number; pergunta: string; arena: ArenaData & { reason?: string }; nome: string; onPick: (i: number) => void }) {
  const letra = arena.recommended === 1 ? "B" : "A";
  return (
    <div className="h-arena">
      <ArenaAnswers messageId={`arena-${id}`} question={pergunta} arena={arena} name={(_m, i) => (i === 0 ? nome : "Desafiante")} onPick={onPick} />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}>
        <MetalCard className="h-juiz">
          <div className="h-juiz-topo"><span className="h-metal-rot"><Swords size={13} />VEREDITO DO JUIZ</span><span className="h-juiz-letra">{letra}</span></div>
          <Markdown text={`**${letra} é melhor.** ${arena.reason || "O juiz escolheu esta resposta como a mais útil e completa."}`} />
        </MetalCard>
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------------- co-work (Ryan, 19/11): com o agente ligado, o mascote fica
   na borda direita, lê o que a pessoa digita e as respostas, e manda dicas. As dicas sobre a resposta vêm do servidor
   (/api/agent/tip, o mesmo modelo sem censura do afinador). */
type Dica = { id: number; texto: string; acao?: [string, () => void] };
function Cowork({ pet, msgs, enviar, preencher, desligar }: { pet: Pet; msgs: Msg[]; enviar: (t: string) => void; preencher: (t: string) => void; desligar: () => void }) {
  const [dicas, setDicas] = useState<Dica[]>([]);
  const [pensando, setPensando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [pilula, setPilula] = useState<Dica | null>(null);
  const [lidas, setLidas] = useState(0);
  const visto = useRef(new Set<string>());
  const mostrar = (d: Omit<Dica, "id">) => {
    const nova = { ...d, id: nextId++ };
    setDicas((v) => [...v.slice(-3), nova]);
    setPilula(nova);
    setTimeout(() => setPilula((p) => (p?.id === nova.id ? null : p)), 6500);
  };
  const dizer = (chave: string, d: Omit<Dica, "id">, espera = 1100) => {
    if (visto.current.has(chave)) return;
    visto.current.add(chave);
    setPensando(true);
    setTimeout(() => { setPensando(false); mostrar(d); }, espera);
  };
  useEffect(() => { dizer("oi", { texto: `Oi, sou ${pet.nome}. Fico aqui olhando o que você pesquisa e aviso quando der para ir mais rápido.` }, 500); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* Lê o que a pessoa digita na caixa (sem mandar nada). */
  useEffect(() => {
    let t: number;
    const ouvir = (e: Event) => {
      const el = e.target as HTMLTextAreaElement;
      if (el.tagName !== "TEXTAREA" || !el.closest(".x-foot, .hx-burn-dock, .hx-start")) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const v = el.value.toLowerCase();
        if (v.length < 12) return;
        if (/(sql|login|senha|xss|c[óo]digo|fun[çc][ãa]o)/.test(v) && !/```|\$|select|<\?php|function|def /.test(v)) dizer("codigo", { texto: "Cola o trecho do código junto. Com ele dá para apontar a linha da falha em vez de falar em teoria." });
        else if (!/(lab|laborat|autoriz|escopo|meu site|meu servidor|cliente|ctf|htb|tryhackme)/.test(v)) dizer("escopo", { texto: "Diz se é seu laboratório ou um cliente com autorização. Com o escopo a resposta já vem com os comandos certos.", acao: ["Pôr escopo", () => preencher(el.value + " (ambiente autorizado: ")] });
      }, 1400);
    };
    document.addEventListener("input", ouvir, true);
    return () => { document.removeEventListener("input", ouvir, true); window.clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* Lê a última resposta pronta e pede ao servidor uma dica de próximo passo. */
  const ultima = [...msgs].reverse().find((x) => x.tipo === "ia" && x.resposta) as Extract<Msg, { tipo: "ia" }> | undefined;
  useEffect(() => {
    if (!ultima || visto.current.has(`r${ultima.id}`)) return;
    visto.current.add(`r${ultima.id}`);
    setPensando(true);
    const ctrl = new AbortController();
    fetch("/api/agent/tip", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ question: ultima.agente || ultima.pergunta, answer: ultima.resposta }), signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { tip?: { dica: string; botao?: string; pedido?: string } | null } | null) => {
        const tip = d?.tip;
        if (tip?.dica) mostrar({ texto: tip.dica, acao: tip.pedido ? [tip.botao || "Pedir agora", () => enviar(tip.pedido!)] : undefined });
      })
      .catch(() => { /* sem dica desta vez */ })
      .finally(() => setPensando(false));
    return () => ctrl.abort();
  }, [ultima?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const naoLidas = aberto ? 0 : Math.max(0, dicas.length - lidas);
  const abrir = (v: boolean) => { setAberto(v); setPilula(null); if (v) setLidas(dicas.length); };
  return (
    <motion.aside className="h-dock" aria-label={`${pet.nome}, co-work`} initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 80, opacity: 0 }} transition={{ type: "spring", bounce: 0.3, duration: 0.55 }}>
      <AnimatePresence>
        {pilula && !aberto && (
          <motion.button key={pilula.id} className="h-ilha" onClick={() => abrir(true)} initial={{ opacity: 0, x: 24, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 24, scale: 0.9 }} transition={{ type: "spring", bounce: 0.35, duration: 0.5 }}>
            <PlushPet bicho={pet.bicho} cor={pet.cor} size={22} /><MessageSquare size={14} /><span>{pilula.texto}</span>
          </motion.button>
        )}
        {aberto && (
          <motion.div className="h-dock-painel" initial={{ opacity: 0, x: 20, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.97 }} transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}>
            <div className="h-cw-cab"><b>{pet.nome}</b><span className="x-mu">co-work · sem censura</span><button className="x-ib" aria-label="Fechar" onClick={() => abrir(false)}><Fechar size={14} /></button></div>
            {dicas.length === 0 && !pensando ? <p className="x-mu h-cw-vazio">Nada por enquanto. Eu aviso.</p> : null}
            <AnimatePresence initial={false}>
              {dicas.map((d) => (
                <motion.div key={d.id} className="h-cw-dica" layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}>
                  <p>{d.texto}</p>
                  {d.acao && <button className="h-btn-vidro" onClick={() => { d.acao![1](); setDicas((v) => v.filter((x) => x.id !== d.id)); abrir(false); }}>{d.acao[0]}<ArrowRight size={13} /></button>}
                </motion.div>
              ))}
            </AnimatePresence>
            {pensando && <p className="h-cw-pensa"><TextShimmer>{`${pet.nome} está olhando`}</TextShimmer></p>}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="h-dock-barra">
        <button className="h-dock-pet" aria-label={aberto ? `Fechar ${pet.nome}` : `Abrir ${pet.nome}`} aria-expanded={aberto} onClick={() => abrir(!aberto)}>
          <PlushPet bicho={pet.bicho} cor={pet.cor} size={24} ativo={pensando} />
          {naoLidas > 0 && <motion.span className="h-dock-badge" initial={{ scale: 0 }} animate={{ scale: 1 }}>{naoLidas}</motion.span>}
        </button>
        <span className="h-dock-sep" />
        <button className="h-dock-btn" aria-label={`Desligar ${pet.nome}`} title="Desligar" onClick={desligar}><LogOut size={15} /></button>
      </div>
    </motion.aside>
  );
}

/* ---------------------------------------------------------------- modais */
function ModalEntrar({ onClose, onEntrar, assinar }: { onClose: () => void; onEntrar: (chave: string) => void; assinar: () => void }) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState("");
  const [conferindo, setConferindo] = useState(false);
  const conferir = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = valor.trim().toUpperCase();
    if (!/^[0-9A-Z][0-9A-Z-]{7,}$/.test(k)) { setErro("Chave não reconhecida. Confira se copiou inteira."); return; }
    setConferindo(true); setErro("");
    const antes = getKey();
    setKey(k);
    const me = await api.me().catch(() => null) as MeX | null;
    setConferindo(false);
    if (!me || (me.tier ?? me.plan) === "free") { setKey(antes); setErro(me ? "Essa chave não tem plano ativo. Pode ter vencido ou estar errada." : "Não consegui conferir agora. Tente de novo em instantes."); return; }
    onEntrar(k); onClose();
  };
  return (
    <Modal onClose={onClose} label="Entrar">
      <div><h2 className="m-h">Entrar no 451.sh</h2><p className="x-tx2">Sua chave de acesso guarda plano, créditos e API. Sem e-mail e sem senha.</p></div>
      <form className="m-bloco" onSubmit={conferir}>
        <p className="x-cap">JÁ TENHO UMA CHAVE</p>
        <input className="m-campo h-input" autoFocus placeholder="Cole sua chave: 451-…" value={valor} onChange={(e) => { setValor(e.target.value); setErro(""); }} aria-invalid={!!erro} aria-describedby="erro-chave" />
        {erro && <p id="erro-chave" className="h-erro">{erro}</p>}
        <button className="x-btn p wide" type="submit" disabled={conferindo}>{conferindo ? "Conferindo…" : "Entrar"}</button>
      </form>
      <div className="m-ou"><span>ou</span></div>
      <div className="m-bloco"><p className="x-cap">AINDA NÃO TENHO</p><p className="x-tx2">No Grátis você não precisa de chave. Ela é criada quando você assina o Pro, e aparece na tela para você guardar.</p><button className="x-btn wide" onClick={assinar}><KeyRound size={16} />Assinar o Pro e criar minha chave</button></div>
    </Modal>
  );
}
/* ---------------------------------------------------------------- plano e limite (preto e cromado, Ryan 19/11) */
function Medidor({ usado, total = LIMITE }: { usado: number; total?: number }) {
  return <Progress className="h-prog" data-alerta={total - usado <= 3 || undefined} value={usado} max={total} aria-label={`${usado} de ${total} mensagens usadas`} />;
}
function CartaoPlano({ conta, usado, restam, saldo, assinar, creditos, usoJusto }: { conta: Conta; usado: number; restam: number; saldo: number; assinar: () => void; creditos: () => void; usoJusto?: UsoJusto | null }) {
  const pro = conta.plano !== "gratis";
  if (pro) return (
    <div className="h-cplano h-vidro">
      <div className="x-between"><span className="x-cap">PLANO {nomePlano(conta.plano).toUpperCase()}</span>{conta.ate ? <span className="x-mono x-mu">até {conta.ate}</span> : null}</div>
      {/* Uso justo por custo real (dono 20/11): mostra a janela mais cheia, em %, nunca em dólar. */}
      {usoJusto && usoJusto.windows.length ? (() => {
        const w = usoJusto.windows.reduce((a, b) => (b.pct > a.pct ? b : a));
        return usoJusto.blocked
          ? <p className="h-cplano-num"><b>Rapid</b><span>uso justo atingido, volta {quando(usoJusto.resetAt)}</span></p>
          : <p className="h-cplano-num"><b>{w.pct}%</b><span>do uso justo ({w.label}) nos modelos 451</span></p>;
      })() : <p className="h-cplano-num"><b>Pro</b><span>uso justo nos modelos 451</span></p>}
      <div className="x-between h-cplano-linha"><span>Créditos</span><b className="x-mono">{num(saldo)}</b></div>
      <button className="h-btn-cromo fino" onClick={creditos}>Ver créditos</button>
    </div>
  );
  return (
    <div className="h-cplano h-vidro" data-alerta={restam <= 3 || undefined}>
      <div className="x-between"><span className="x-cap">PLANO GRÁTIS</span>{usado > 0 && RENOVA !== "em breve" ? <span className="x-mono x-mu">renova {RENOVA.replace(/^(hoje|amanhã) às /, "")}</span> : <span className="x-mono x-mu">por dia</span>}</div>
      <p className="h-cplano-num"><b>{restam}</b><span>de {LIMITE} mensagens hoje</span></p>
      <Medidor usado={usado} />
      <div className="x-between h-cplano-linha"><span>Pro: sem limite, Max e Agente</span></div>
      <button className="h-btn-cromo fino" onClick={assinar}>Assinar o Pro <span>R$ 59,90</span></button>
    </div>
  );
}
function AvisoLimite({ usado, restam, assinar }: { usado: number; restam: number; assinar: () => void }) {
  return (
    <motion.div className="h-aviso" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}>
      <div className="h-aviso-linha">
        <p><span className="x-mono h-aviso-cont">{usado}/{LIMITE}</span><span>{restam === 0 ? <>Acabou por hoje. Volta <b>{RENOVA}</b>.</> : <>{restam === 1 ? "Resta 1 mensagem" : `Restam ${restam} mensagens`}. Voltam <b>{RENOVA}</b>.</>}</span></p>
        <button className="h-aviso-acao" onClick={assinar}>{restam === 0 ? "Continuar no Pro" : "Tirar o limite"}<ArrowRight size={14} /></button>
      </div>
      <Medidor usado={usado} />
    </motion.div>
  );
}
function ModalUpsell({ motivo, restam: restamReal, onClose, comprar }: { motivo: Upsell; restam: number; onClose: () => void; comprar: (c: Compra) => void }) {
  const restam = motivo === "acabou" ? 0 : restamReal;
  const textos: Record<Upsell, [string, string]> = {
    perto: [`Faltam ${restam}. E você está no meio do alvo.`, `Quando acabarem, esta conversa para aqui até ${RENOVA}. No Pro você termina agora, sem contar mensagem.`],
    acabou: ["Acabou por hoje. O alvo não.", `Suas ${LIMITE} mensagens grátis voltam ${RENOVA}. No Pro, esta conversa continua agora, do ponto onde parou.`],
    modelo: ["Esse modelo é do Pro.", "O 451 Rapid responde em segundos e o 451 Max pensa antes de responder. Os dois sem limite diário no Pro."],
    agente: ["O agente é do Pro.", "Ele reescreve seu pedido como um pentester sênior antes de mandar: mais contexto, entrega em passos, sem rodeio. E fica do lado dando dicas enquanto você pesquisa."],
    arena: ["A arena é do Pro.", "Dois modelos respondem e um juiz escolhe."],
    api: ["A API é do Pro.", "Use o 451 no seu código com a mesma chave."],
  };
  const [h, p] = textos[motivo];
  const perto = motivo === "perto" || motivo === "acabou";
  return (
    <Modal onClose={onClose} label={h} largo>
      <div className="h-up">
        <div className="h-up-esq">
          {perto && <div className="h-up-medidor"><span className="x-mono">{LIMITE - restam} de {LIMITE} hoje</span><Medidor usado={LIMITE - restam} /></div>}
          <h2 className="m-h">{h}</h2>
          <p className="x-tx2 h-up-p">{p}</p>
          <ul className="h-up-lista">
            {["Mensagens sem limite diário no Rapid, Titan e Max", "451 Max: o que pensa antes de responder", "Agente que afina seu pedido antes de enviar", "500 créditos por mês para os modelos pagos com créditos", "Imagem e PDF no chat, arena e API"].map((t) => <li key={t}><Check size={16} />{t}</li>)}
          </ul>
        </div>
        <div className="h-up-dir">
          <p className="x-cap">PRO</p>
          <p><b className="p-preco">R$ 59,90</b> <span className="x-mu">por mês</span></p>
          <p className="x-mu h-up-dia">R$ 2 por dia. Menos que um café.</p>
          <button className="h-btn-cromo fino h-up-cta" onClick={() => comprar({ tipo: "plano", plano: "pro", periodo: "mensal" })}>{perto ? "Continuar no Pro" : "Liberar no Pro"}</button>
          <p className="x-mu h-up-pg">Pix ou cripto. Libera na hora, na sua chave.</p>
          {perto && <button className="h-btn-vidro h-largo-btn" onClick={onClose}>{motivo === "acabou" ? `Esperar até ${RENOVA}` : `Usar as ${restam} que restam`}</button>}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- configurações (modal, pedido do Ryan 19/11: nada de tela) */
function ModalConfig({ pet, setPet, prefs, setPrefs, aba, setAba, ativo, onClose, conta, usado, restam, me, comprar, sair, entrar }: { pet: Pet; setPet: (p: Pet) => void; prefs: Prefs; setPrefs: (p: Prefs) => void; aba: Cfg; setAba: (c: Cfg) => void; ativo: boolean; onClose: () => void; conta: Conta; usado: number; restam: number; me: MeX | null; comprar: (c: Compra) => void; sair: () => void; entrar: () => void }) {
  const pro = conta.plano !== "gratis";
  const itens: [Cfg, ReactNode, string][] = [["chave", <KeyRound size={17} />, "Sua chave"], ["agente", <Crosshair size={17} />, "Seu agente"], ["planos", <CreditCard size={17} />, "Plano"], ["creditos", <Coins size={17} />, "Créditos"], ["api", <Code2 size={17} />, "API"]];
  return (
    <Modal onClose={onClose} label="Configurações" classe="h-cfg" ativo={ativo}>
      <div className="h-cfg-grade">
        <nav className="h-cfg-nav" aria-label="Seções">
          <p className="h-cfg-tit">Configurações</p>
          {itens.map(([id, ic, t0]) => { const t = id === "agente" && pro ? pet.nome : t0; return <button key={id} data-on={(aba === id) || undefined} onClick={() => setAba(id)}>{ic}{t}{(id === "api" || id === "agente") && !pro && <span className="x-pill osso">Pro</span>}</button>; })}
          <span className="x-sp" />
          <a href={xIntent} target="_blank" rel="noreferrer" className="h-cfg-x"><LogoX s={13} />Suporte e novidades<small className="x-mono">@{X_HANDLE}</small></a>
        </nav>
        <div className="h-cfg-corpo">
          {aba === "chave" ? (conta.chave ? <PaginaChave conta={conta} usado={usado} restam={restam} sair={sair} ir={setAba} /> : (
            <div className="p-pag"><div className="x-gap22"><div><h1 className="p-h1">Sua chave</h1><p className="x-tx2">Você ainda está sem chave. Ela guarda plano, créditos, API e limites, sem e-mail e sem senha. Quem tem a chave tem a conta.</p></div><div><button className="x-btn p" onClick={entrar}><KeyRound size={16} />Entrar com a chave</button><button className="x-btn" onClick={() => comprar({ tipo: "plano", plano: "pro", periodo: "mensal" })}>Assinar o Pro</button></div></div></div>
          )) : aba === "agente" ? (pro ? <PaginaAgente pet={pet} setPet={setPet} prefs={prefs} setPrefs={setPrefs} /> : <Bloqueio icone={<Crosshair size={22} />} titulo="Seu agente" texto={`Um agente seu, que afina cada pedido, chama os ${ESPECIALISTAS_N} especialistas certos e fica do lado dando dicas. Faz parte do Pro.`} onPro={() => comprar({ tipo: "plano", plano: "pro", periodo: "mensal" })} />)
          : aba === "api" ? (pro ? <PaginaApi conta={conta} me={me} /> : <Bloqueio icone={<Code2 size={22} />} titulo="API para usar o 451 no seu código" texto="Endereço no formato da OpenAI, com a mesma chave que você usa para entrar. Exclusiva do Pro e do Pro Plus." onPro={() => comprar({ tipo: "plano", plano: "pro", periodo: "mensal" })} />)
            : <PaginaPlanos aba={aba as "planos" | "creditos"} setAba={setAba} conta={conta} me={me} comprar={comprar} />}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- seu agente (Ryan, 19/11): configurações dele, aprendizado
   e a relação com os 8 especialistas da home. Tudo de exemplo no protótipo. */
const ESPECIALISTAS: [string, string][] = [
  ["Pentest", "Por onde entrar primeiro: recon, falhas, rota crítica"], ["Recon & OSINT", "O que o alvo deixa escapar para fora"],
  ["Invasão", "Falha explorada e o caminho até dentro"], ["AppSec", "Revisa o código e acha a falha antes"],
  ["Engenharia reversa", "Desmonta o binário: o que lê, guarda e executa"], ["Forense", "Reconstrói o ataque a partir de logs e discos"],
  ["Engenharia social", "Phishing, pretexto e o clique certo"], ["Cripto & CTF", "Criptografia, esteganografia e CTF"],
];
function Interruptor({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className="h-sw" data-on={on || undefined} onClick={() => set(!on)}><i /></button>;
}
function Linha({ icone, titulo, valor, children, aberta, abrir }: { icone: ReactNode; titulo: string; valor?: ReactNode; children?: ReactNode; aberta?: boolean; abrir?: () => void }) {
  return (
    <div className="h-ag-linha" data-aberta={aberta || undefined}>
      <button className="h-ag-cab" onClick={abrir} disabled={!abrir}>{icone}<span className="h-ag-tit">{titulo}</span><span className="h-ag-val">{valor}</span>{abrir && <ArrowRight size={15} className="h-ag-seta" />}</button>
      <AnimatePresence initial={false}>{aberta && children ? <motion.div className="h-ag-corpo" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{children}</motion.div> : null}</AnimatePresence>
    </div>
  );
}
const ESTILOS = [{ value: "direto", label: "Direto" }, { value: "equilibrado", label: "Equilibrado" }, { value: "detalhado", label: "Detalhado" }];
const FORMATOS = [{ value: "passos", label: "Passo a passo" }, { value: "relatorio", label: "Relatório" }, { value: "codigo", label: "Código primeiro" }];
const QUANDO = [{ value: "sempre", label: "Sempre" }, { value: "curtos", label: "Só pedidos curtos" }];
function refinarExemplo(pedido: string, estilo: string, formato: string, contexto: string) {
  const fmt = formato === "passos" ? "passo a passo, com os comandos" : formato === "relatorio" ? "em formato de relatório, com achados e gravidade" : "começando pelo código ou comando pronto e explicando depois";
  const tom = estilo === "direto" ? "Seja direto, sem introdução." : estilo === "detalhado" ? "Explique o porquê de cada passo e o que pode dar errado." : "Explique só o necessário.";
  return `${pedido.replace(/\.$/, "")}: por onde começo, ${fmt}?${contexto ? ` Contexto: ${contexto}` : ""} ${tom}`;
}
function PaginaAgente({ pet, setPet, prefs, setPrefs }: { pet: Pet; setPet: (p: Pet) => void; prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  const exemplo = refinarExemplo("Testar meu site", prefs.estilo, prefs.formato, prefs.contexto);
  const [ctx, setCtx] = useState(prefs.contexto);
  const api = `curl ${BASE}/chat/completions \\
  -H "Authorization: Bearer SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "451-titan-uncensored", "agent": true,
       "messages": [{"role": "user", "content": "testar meu site"}]}'`;
  const apiRefinar = `curl ${BASE}/agent/refine \\
  -H "Authorization: Bearer SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "testar meu site", "prefs": {"estilo": "${prefs.estilo}", "formato": "${prefs.formato}"}}'
# → {"refined": "…", "changed": true}`;
  return (
    <div className="p-pag"><div className="x-gap22">
      <div className="h-ag-perfil">
        <span className="h-ag-av"><PlushPet bicho={pet.bicho} cor={pet.cor} size={72} ativo /></span>
        <div className="h-ag-ident">
          <input className="h-ag-nomebig" aria-label="Nome do agente" value={pet.nome} maxLength={18} onChange={(e) => setPet({ ...pet, nome: e.target.value })} onBlur={() => !pet.nome.trim() && setPet({ ...pet, nome: "Agente" })} />
          <input className="h-ag-titulo" aria-label="Título" placeholder="Título: o que ele faz por você" value={pet.titulo} maxLength={60} onChange={(e) => setPet({ ...pet, titulo: e.target.value })} />
          <textarea className="h-ag-desc" aria-label="Descrição" placeholder="Descrição: como ele deve pensar, o que você costuma pedir" rows={2} value={pet.descricao} maxLength={280} onChange={(e) => setPet({ ...pet, descricao: e.target.value })} />
        </div>
      </div>
      <p className="x-mu h-ag-sobre">Refina cada mensagem antes de ir para o modelo. Os {ESPECIALISTAS_N} especialistas entram sozinhos quando o pedido precisa.</p>

      <section><p className="x-cap h-ag-grupo">COMO ELE REFINA</p><div className="h-ag-lista h-ag-refina">
        <div className="h-ag-campo"><span>Estilo</span><GlassSegmented label="Estilo do pedido refinado" options={ESTILOS} value={prefs.estilo} onValueChange={(v) => setPrefs({ ...prefs, estilo: v })} size="sm" /></div>
        <div className="h-ag-campo"><span>Formato da resposta</span><GlassSegmented label="Formato" options={FORMATOS} value={prefs.formato} onValueChange={(v) => setPrefs({ ...prefs, formato: v })} size="sm" /></div>
        <div className="h-ag-campo"><span>Quando refinar</span><GlassSegmented label="Quando refinar" options={QUANDO} value={prefs.quando} onValueChange={(v) => setPrefs({ ...prefs, quando: v })} size="sm" /></div>
        <label className="h-ag-campo col"><span>Contexto que ele sempre junta</span><textarea className="h-ag-txt" placeholder="Ex.: testo no meu laboratório e em clientes com autorização. Stack: PHP e MySQL." value={ctx} maxLength={400} onChange={(e) => setCtx(e.target.value)} onBlur={() => setPrefs({ ...prefs, contexto: ctx.trim() })} rows={2} /></label>
        <div className="h-ag-previa">
          <p className="x-cap">PRÉVIA</p>
          <div className="h-ag-prev-l"><small>Você digita</small><span>Testar meu site</span></div>
          <div className="h-ag-prev-l"><small>{pet.nome} manda (exemplo)</small><motion.span key={exemplo} initial={{ opacity: 0, filter: "blur(3px)" }} animate={{ opacity: 1, filter: "blur(0px)" }}>{exemplo}</motion.span></div>
        </div>
      </div></section>

      <section><p className="x-cap h-ag-grupo">MASCOTE</p><div className="h-ag-lista h-ag-aparencia">
        <div className="h-ag-bichos" role="radiogroup" aria-label="Bicho">{BICHOS.map(([b, n]) => (
          <button key={b} role="radio" aria-checked={pet.bicho === b} data-on={pet.bicho === b || undefined} onClick={() => setPet({ ...pet, bicho: b })}><PlushPet bicho={b} cor={pet.cor} size={44} ativo={pet.bicho === b} /><span>{n}</span></button>
        ))}</div>
        <div className="h-ag-cores" role="radiogroup" aria-label="Cor">{CORES.map(([c, n]) => (
          <button key={c} role="radio" aria-checked={pet.cor === c} aria-label={n} title={n} data-on={pet.cor === c || undefined} style={{ background: c }} onClick={() => setPet({ ...pet, cor: c })} />
        ))}</div>
      </div></section>

      <section><p className="x-cap h-ag-grupo">ESPECIALISTAS QUE ELE CHAMA</p><div className="h-ag-lista">
        {ESPECIALISTAS.map(([n, d]) => <Linha key={n} icone={<Crosshair size={17} />} titulo={n} valor={<span className="x-mu">{d}</span>} />)}
      </div></section>

      <section><p className="x-cap h-ag-grupo">NA API</p>
        <p className="x-tx2 h-ag-api-p">O mesmo agente funciona pela API. Mande <code>"agent": true</code> na chamada normal, ou use só o refinador.</p>
        <CodeBlock code={api} language="bash" filename="com o agente" />
        <div style={{ height: 10 }} />
        <CodeBlock code={apiRefinar} language="bash" filename="só refinar o pedido" />
      </section>
      <div><button className="h-entrar" onClick={() => { setPrefs(PREFS0); setCtx(""); setPet(PET0); }}>Voltar ao padrão</button></div>
      <p className="x-mu p-nota">Nome, mascote e preferências ficam neste aparelho. A prévia acima é um exemplo; o pedido real é escrito pelo modelo na hora.</p>
    </div></div>
  );
}

/* ---------------------------------------------------------------- páginas */
const sim = <Check size={17} className="x-ok" aria-label="Incluído" />, nao = <Minus size={17} className="x-mu" aria-label="Não incluído" />;
function PaginaPlanos({ aba, setAba, conta, me, comprar }: { aba: "planos" | "creditos"; setAba: (p: Cfg) => void; conta: Conta; me: MeX | null; comprar: (c: Compra) => void }) {
  const modelos = me?.models ?? [];
  const [periodo, setPeriodo] = useState<Periodo>("mensal");
  const saldo = total(conta);
  const pPro = PRECOS.pro[periodo]!;
  const linhas: [string, ReactNode, ReactNode, ReactNode][] = [
    ["Mensagens nos modelos 451", <><b>15 por dia</b><small>só no 451 Titan</small></>, <><b>Uso justo</b><small>Rapid, Titan e Max</small></>, <><b>Uso justo</b><small>Rapid, Titan e Max</small></>],
    ["Como o limite conta", <small>15 a cada 5 h e 15 por dia: na prática vale o dia. Máximo de 90 por semana.</small>, <small>Uso justo pelo custo de cada resposta: passou do teto, segue no 451 Rapid</small>, <small>Uso justo pelo custo de cada resposta: passou do teto, segue no 451 Rapid</small>],
    ["Imagens geradas", <><b>3 por dia</b><small>até 20 por mês, sem conteúdo adulto</small></>, <><b>20 por dia</b><small>até 200 por mês; depois, 5 créditos cada (adulta, 20)</small></>, <><b>20 por dia</b><small>até 200 por mês; depois, 5 créditos cada (adulta, 20)</small></>],
    ["Modelos pagos com créditos", nao, sim, sim],
    ["Créditos incluídos por mês", <b>0</b>, <><b>500</b><small>não acumulam</small></>, <><b>13.000</b><small>acumulam por até 2 meses</small></>],
    ["Agente que afina o pedido", nao, sim, sim],
    ["Enviar imagem e PDF", nao, sim, sim],
    ["Arquivos de texto", <b>5 por dia</b>, sim, sim],
    ["Arena: 2 respostas e juiz", nao, sim, sim],
    ["API para usar fora do app", nao, sim, sim],
  ];
  return (
    <div className="x-scroll p-pag"><div className="x-w980 x-gap22">
      <div><h1 className="p-h1">{aba === "planos" ? "Plano" : "Créditos"}</h1><p className="x-tx2">{aba === "planos" ? "O plano define quantas mensagens você manda por dia. Pague por Pix ou cripto; o plano fica na sua chave." : "Créditos pagam os modelos marcados com Créditos. O Pro traz 500 por mês."}</p></div>
      <div className="p-abas" role="tablist"><a role="tab" aria-selected={aba === "planos"} onClick={() => setAba("planos")}>Planos</a><a role="tab" aria-selected={aba === "creditos"} onClick={() => setAba("creditos")}>Créditos</a></div>
      {aba === "planos" ? (
        <>
          <div className="x-between"><span className="x-tx2">Seu plano: <b className="h-branco">{nomePlano(conta.plano)}</b>{conta.ate ? ` até ${conta.ate}` : ""}</span>
            <div className="p-abas peq">{(["mensal", "trimestral", "anual"] as Periodo[]).map((p) => <a key={p} aria-selected={periodo === p} onClick={() => setPeriodo(p)}>{p.charAt(0).toUpperCase() + p.slice(1)}{p === "anual" ? " · −25%" : p === "trimestral" ? " · −11%" : ""}</a>)}</div></div>
          <div className="p-planos">
            <div className="p-plano"><b className="p-nome">Grátis</b><p><b className="p-preco">R$ 0</b></p><button className="x-btn wide" disabled>{conta.plano === "gratis" ? "Seu plano" : "Incluído"}</button><span className="x-mu p-ou">15 mensagens por dia, sem chave</span></div>
            <div className="p-plano" data-dest><span className="x-pill osso p-mais">Mais escolhido</span><b className="p-nome">Pro</b>
              <p><b className="p-preco">{reais(pPro)}</b> <span className="x-mu">{periodo === "mensal" ? "por mês" : periodo === "trimestral" ? "a cada 3 meses" : "por ano"}</span></p>
              <button className="x-btn p wide" onClick={() => comprar({ tipo: "plano", plano: "pro", periodo })}>{conta.plano === "pro" ? "Renovar Pro" : "Assinar Pro"}</button>
              <span className="x-mu p-ou">Pix ou cripto · libera na hora</span></div>
            <div className="p-plano"><b className="p-nome">Pro Plus</b><p><b className="p-preco">R$ 149,90</b> <span className="x-mu">por mês</span></p>
              <button className="x-btn wide" disabled={conta.plano !== "plus"} onClick={() => comprar({ tipo: "plano", plano: "plus", periodo: "mensal" })}>{conta.plano === "plus" ? "Seu plano" : "Em breve"}</button><span className="x-mu p-ou">Ainda não está à venda</span></div>
          </div>
          <div className="p-tabela" role="table">
            <div className="p-linha p-cab" role="row"><span /><span>Grátis</span><span className="p-pro">Pro</span><span>Pro Plus</span></div>
            {linhas.map(([k, a, b, c]) => <div key={k} className="p-linha" role="row"><span role="rowheader">{k}</span><span role="cell">{a}</span><span role="cell" className="p-pro">{b}</span><span role="cell">{c}</span></div>)}
          </div>
          <p className="x-mu p-nota">Pix ou cripto. O plano fica na sua chave e vale até o fim do período pago; pagar de novo soma o tempo.</p>
        </>
      ) : (
        <>
          <div className="c2-saldo">
            <div><p className="x-cap">SALDO TOTAL</p><b className="c2-num">{num(saldo)}</b><span className="x-tx2">créditos · {reais(saldo / 100)}</span></div>
            <div><p className="x-cap">DO PLANO</p><b>{num(conta.creditosPlano)}</b><span className="x-mu">{conta.plano === "pro" ? "500 por mês, não acumulam" : conta.plano === "plus" ? "13.000 por mês" : "o Grátis não inclui"}</span></div>
            <div><p className="x-cap">AVULSOS</p><b>{num(conta.avulsos)}</b><span className="x-mu">não vencem</span></div>
            <p className="x-mu c2-ordem">Os do plano são gastos primeiro. O gasto exato aparece embaixo de cada resposta.</p>
          </div>
          <section><h2 className="p-h2">Comprar créditos</h2><p className="x-tx2">A compra avulsa abre em breve, por Pix ou cripto. Por enquanto, os créditos vêm com o Pro.</p>
            <div className="c2-pacotes">{PACOTES.map(([v, c], k) => <div key={v} className="p-plano" data-dest={k === 1 || undefined}><b className="p-preco">{num(c)}</b><span className="x-tx2">créditos</span><p className="x-mu">{reais(v)} em créditos</p><button className="x-btn wide" disabled onClick={() => comprar({ tipo: "creditos", reais: v, creditos: c })}>Em breve · {reais(v)}</button></div>)}</div>
          </section>
          <section><h2 className="p-h2">Quanto cada modelo gasta</h2>
            <div className="p-tabela" role="table">
              <div className="p-linha p-cab" role="row"><span>Modelo</span><span>Paga com</span><span>Resposta típica</span><span>Em reais</span></div>
              {modelos.map((m) => { const cr = m.bucket === "credits" || /^451 (Hermes|Kimi)$/.test(m.name); return <div key={m.id} className="p-linha" role="row"><span><Cig s={16} /> {m.name}</span><span>{cr ? "Créditos" : "Mensagens do plano"}</span><span className="x-mono">{cr ? "conforme o tamanho" : "0 créditos"}</span><span className="x-mono">{cr ? "1 crédito = R$ 0,01" : "incluído"}</span></div>; })}
            </div>
            <p className="x-mu p-nota">Respostas maiores gastam mais. O gasto exato aparece embaixo de cada resposta.</p>
          </section>
        </>
      )}
    </div></div>
  );
}

function PaginaApi({ conta, me }: { conta: Conta; me: MeX | null }) {
  void me;
  const [ling, setLing] = useState<"curl" | "python" | "js">("curl");
  const k = conta.chave ?? "SUA_CHAVE";
  const cod = {
    curl: `curl ${BASE}/chat/completions \\\n  -H "Authorization: Bearer ${k}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "451-titan-uncensored", "messages": [{"role": "user", "content": "Oi"}]}'`,
    python: `from openai import OpenAI\n\nclient = OpenAI(base_url="${BASE}", api_key="${k}")\nr = client.chat.completions.create(\n    model="451-titan-uncensored",\n    messages=[{"role": "user", "content": "Oi"}],\n)\nprint(r.choices[0].message.content)`,
    js: `import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: "${BASE}", apiKey: "${k}" });\nconst r = await client.chat.completions.create({\n  model: "451-titan-uncensored",\n  messages: [{ role: "user", content: "Oi" }],\n});\nconsole.log(r.choices[0].message.content);`,
  }[ling];
  const env = `OPENAI_BASE_URL=${BASE}\nOPENAI_API_KEY=${k}\nOPENAI_MODEL=451-titan-uncensored`;
  return (
    <div className="x-scroll p-pag"><div className="x-w980 x-gap22">
      <div><h1 className="p-h1">API</h1><p className="x-tx2">Use os modelos do 451.sh no seu código. A API segue o formato da OpenAI: qualquer biblioteca da OpenAI funciona trocando o endereço e a chave.</p></div>
      <div className="api-grid">
        <div className="api-campo"><p className="x-cap">ENDEREÇO (BASE URL)</p><div className="api-val"><code>{BASE}</code><CopyButton copiedLabel="Copiado" failedLabel="Não copiou" value={BASE} label="Copiar" /></div></div>
        <div className="api-campo"><p className="x-cap">SUA CHAVE (A MESMA DE ENTRAR)</p><div className="api-val"><code>{mascara(k)}</code><CopyButton copiedLabel="Copiado" failedLabel="Não copiou" value={k} label="Copiar" /></div><small className="x-mu">Vai no cabeçalho <code>Authorization: Bearer SUA_CHAVE</code>.</small></div>
      </div>
      <section><div className="x-between"><h2 className="p-h2">Configuração pronta (.env)</h2></div><CodeBlock code={env} language="bash" filename=".env" /></section>
      <section><h2 className="p-h2">Agente na API</h2><p className="x-tx2">Mande <code>"agent": true</code> para o seu agente refinar a mensagem antes do modelo, com as suas configurações. Ou chame <code>POST {BASE}/agent/refine</code> para receber só o pedido refinado.</p></section>
      <section><h2 className="p-h2">Modelos</h2>
        <div className="p-tabela" role="table">{([["451-rapid-uncensored", "Mensagens do plano"], ["451-titan-uncensored", "Mensagens do plano · padrão"], ["451-max-uncensored", "Mensagens do plano"], ["451-hermes-uncensored", "Créditos, conforme o tamanho"], ["451-kimi-uncensored", "Créditos, conforme o tamanho"]] as [string, string][]).map(([id, p]) => <div key={id} className="p-linha api-mod" role="row"><span className="x-mono"><Cig s={15} />{id}</span><span className="x-tx2">{p}</span><CopyButton copiedLabel="Copiado" failedLabel="Não copiou" value={id} label={`Copiar ${id}`} iconOnly /></div>)}</div>
      </section>
      <section><div className="x-between"><h2 className="p-h2">Primeira chamada</h2><div className="p-abas peq">{(["curl", "python", "js"] as const).map((l) => <a key={l} aria-selected={ling === l} onClick={() => setLing(l)}>{l === "curl" ? "cURL" : l === "python" ? "Python" : "Node"}</a>)}</div></div>
        <CodeBlock code={cod} language={ling === "curl" ? "bash" : ling === "python" ? "python" : "javascript"} filename={ling === "curl" ? "terminal" : ling === "python" ? "exemplo.py" : "exemplo.mjs"} />
        <p className="x-mu p-nota">Os nomes antigos (451-titan e os outros) continuam funcionando. Streaming: envie "stream": true. Lista de modelos: GET {BASE}/models. Erros: 401 chave inválida ou sem Pro, 429 limite, 402 créditos acabaram.</p>
      </section>
    </div></div>
  );
}

function PaginaChave({ conta, usado, restam, sair, ir }: { conta: Conta; usado: number; restam: number; sair: () => void; ir: (p: Cfg) => void }) {
  void restam;
  const [ver, setVer] = useState(false);
  const pro = conta.plano !== "gratis";
  return (
    <div className="x-scroll p-pag"><div className="x-w980 x-gap22">
      <div><h1 className="p-h1">Sua chave de acesso</h1><p className="x-tx2">Tudo o que é seu fica nesta chave: plano, créditos, API e limites. Para entrar em outro aparelho, cole a chave. Quem tem a chave tem a conta.</p></div>
      <div className="api-campo"><p className="x-cap">CHAVE</p><div className="api-val"><code>{ver ? conta.chave : mascara(conta.chave!)}</code><button className="x-btn sm" onClick={() => setVer(!ver)}>{ver ? "Esconder" : "Mostrar"}</button><CopyButton copiedLabel="Copiado" failedLabel="Não copiou" value={conta.chave!} label="Copiar" /><button className="x-btn sm" onClick={sair}><LogOut size={15} />Sair</button></div></div>
      <div className="k-grid">
        <div className="k-card"><p className="x-cap">PLANO</p><b>{nomePlano(conta.plano)}</b><span className="x-tx2">{pro ? (conta.ate ? `Vale até ${conta.ate}` : "Ativo") : `${usado} de ${LIMITE} mensagens hoje · renova ${RENOVA}`}</span><a className="k-link" onClick={() => ir("planos")}>{pro ? "Mudar plano" : "Assinar Pro"}</a></div>
        <div className="k-card"><p className="x-cap">CRÉDITOS</p><b>{num(total(conta))}</b><span className="x-tx2">{num(conta.creditosPlano)} do plano + {num(conta.avulsos)} avulsos</span><a className="k-link" onClick={() => ir("creditos")}>Ver créditos</a></div>
        <div className="k-card"><p className="x-cap">API</p><b>{pro ? "Ativa" : "Desligada"}</b><span className="x-tx2">{pro ? "Mesmos limites do plano." : "Liga com o Pro."}</span><a className="k-link" onClick={() => ir("api")}>Ver endereço e exemplos</a></div>
      </div>
      <p className="x-mu p-nota">Perdeu a chave? Sem ela não dá para recuperar o plano nem os créditos. Guarde em um gerenciador de senhas.</p>
    </div></div>
  );
}

/* Página Imagens v3 (20/11): um modelo só (451 Image), formato num menu da caixa, abas Criar e Galeria.
   A conversa daqui guarda só a ordem das imagens; apagar a conversa mantém as imagens na Galeria. */
const IMG_MODELO: ModelOption = { id: "451-image", name: "451 Image", short: "451 Image", note: "Um modelo para tudo: foto, arte, anime e texto na imagem. Adulto no Pro, com 18+." };
const IMG_FORMATOS: { v: ImageFormato; nome: string; nota: string }[] = [
  { v: "auto", nome: "Auto", nota: "A IA escolhe pelo pedido" },
  { v: "1:1", nome: "Quadrada", nota: "1:1 · post e avatar" },
  { v: "3:4", nome: "Retrato", nota: "3:4 · pessoa e produto" },
  { v: "9:16", nome: "Vertical", nota: "9:16 · stories e fundo de tela do celular" },
  { v: "16:9", nome: "Paisagem", nota: "16:9 · capa e fundo de tela do computador" },
];
const IMG_SUGESTOES = ["Uma cigarra cromada sobre um terminal antigo", "Retrato noir de uma hacker sob luz de neon", "Cidade cyberpunk na chuva vista de cima"];
const proporcao = (f?: ImageFormato) => (!f || f === "auto" ? "1:1" : f).replace(":", " / ");
type Gerando = { id: string; prompt: string; formato: ImageFormato; erro?: string; idade?: boolean; ctrl?: AbortController };
type AbaImg = "criar" | "galeria";

function PaginaImagens({ ativa, pro, aoGerar, onUpsell, confirmar }: { ativa: boolean; pro: boolean; aoGerar: () => void; onUpsell: () => void; confirmar: (c: Confirmacao) => void }) {
  const [lista, setLista] = useState<ImgItem[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [conversa, setConversaS] = useState<string[]>(() => lerConversaImg() ?? []);
  const [prefs, setPrefsState] = useState<ImgPrefs>(lerImgPrefs);
  const [fila, setFila] = useState<Gerando[]>([]);
  const [aberta, setAberta] = useState<ImgItem | null>(null);
  const [pedidoEd, setPedidoEd] = useState("");
  const [aba, setAbaS] = useState<AbaImg>(() => (uiSalvo() as { abaImg?: AbaImg }).abaImg === "galeria" ? "galeria" : "criar");
  const fundo = useRef<HTMLDivElement>(null);
  const setAba = (a: AbaImg) => { setAbaS(a); gravar(UI_KEY, { ...uiSalvo(), abaImg: a }); };
  const setConversa = (f: (c: string[]) => string[]) => setConversaS((c) => { const n = f(c); gravarConversaImg(n); return n; });
  useEffect(() => {
    void listarImagens().then((l) => {
      setLista(l);
      // Primeira vez com a conversa separada: as imagens que já existiam entram nela, em ordem.
      if (lerConversaImg() === null) { const ids = [...l].reverse().map((i) => i.id); gravarConversaImg(ids); setConversaS(ids); }
      setCarregou(true);
    });
  }, []);
  // Imagens geradas no chat também entram na Galeria: recarrega ao voltar para cá.
  useEffect(() => { if (ativa && carregou) void listarImagens().then(setLista); }, [ativa]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!ativa) setAberta(null); }, [ativa]);
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberta(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberta]);
  const rolarFim = () => requestAnimationFrame(() => fundo.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  const setPrefs = (p: ImgPrefs) => { setPrefsState(p); salvarImgPrefs(p); };
  const porId = useMemo(() => new Map(lista.map((i) => [i.id, i])), [lista]);
  const feed = conversa.map((id) => porId.get(id)).filter((i): i is ImgItem => !!i);

  const novaSug = (item: ImgItem) => {
    void api.imageFollowups(item.prompt).then((s) => {
      if (!s.length) return;
      const com = { ...item, sugestoes: s };
      void atualizarImagem(com);
      setLista((l) => l.map((x) => (x.id === item.id ? com : x)));
    });
  };
  const concluir = (g: Gerando, p: Promise<ImageResult>, extra: Partial<ImageResult> = {}) => {
    setAba("criar"); setFila((f) => [...f, g]); rolarFim();
    p.then(async (r) => {
      if (g.ctrl?.signal.aborted) return;
      const item = await guardarImagem(g.prompt, { ...r, ...extra });
      setFila((f) => f.filter((x) => x.id !== g.id));
      if (item) { setLista((l) => [item, ...l].slice(0, IMG_MAX)); setConversa((c) => [...c, item.id]); novaSug(item); }
      aoGerar(); rolarFim();
    }).catch((e) => { if (!g.ctrl?.signal.aborted) setFila((f) => f.map((x) => (x.id === g.id ? { ...x, erro: erroDeImagem(e), idade: e instanceof ImageError && e.code === "age_required" } : x))); });
  };
  /* Cancelar: fecha a conexão (o servidor para a GPU e devolve a cota) e tira o pedido da tela. */
  const cancelar = (g: Gerando) => { g.ctrl?.abort(); setFila((f) => f.filter((x) => x.id !== g.id)); };
  const gerandoAgora = fila.filter((g) => !g.erro);
  const gerar = (texto: string, extra: ImageOpts = {}) => {
    const d = texto.trim();
    if (!d) return;
    const opts = { ...optsDeImagem(prefs), ...extra };
    const ctrl = new AbortController();
    concluir({ id: `${Date.now()}`, prompt: d, formato: !opts.formato || opts.formato === "auto" ? "1:1" : opts.formato, ctrl }, api.image(d, opts, ctrl.signal));
  };
  const editar = (i: ImgItem, pedido: string) => {
    const d = pedido.trim();
    if (!d) return;
    setAberta(null); setPedidoEd("");
    const ctrl = new AbortController();
    concluir({ id: `${Date.now()}`, prompt: d, formato: i.formato && i.formato !== "auto" ? i.formato : "1:1", ctrl },
      api.editImage(d, [{ src: i.src, token: i.token }], { base: i.final, confirmAge: prefs.adulto, adulto: i.estilo === "sem-filtro" || undefined }, ctrl.signal),
      { estilo: i.estilo, formato: i.formato });
  };
  const apagar = (i: ImgItem) => { void apagarImagem(i.id); setLista((l) => l.filter((x) => x.id !== i.id)); setConversa((c) => c.filter((x) => x !== i.id)); setAberta(null); };
  const apagarConversa = () => confirmar({ titulo: "Apagar a conversa de imagens?", texto: "Os pedidos somem desta tela. As imagens continuam na Galeria.", botao: "Apagar conversa", acao: () => { for (const g of fila) g.ctrl?.abort(); setConversa(() => []); setFila([]); } });
  const apagarTodas = () => confirmar({ titulo: `Apagar as ${lista.length} imagens?`, texto: "Elas somem deste aparelho e não dá para desfazer. Baixe antes as que quiser guardar.", botao: "Apagar todas",
    acao: () => { for (const i of lista) void apagarImagem(i.id); setLista([]); setConversa(() => []); } });

  const caixaImg = (ph: string) => (
    <Composer models={[IMG_MODELO]} model={IMG_MODELO} onModel={() => { /* modelo único */ }} noAttach
      busy={gerandoAgora.length > 0} placeholder={ph} maxLength={1500}
      onSubmit={(p) => gerar(p.text)} onStop={() => { for (const g of gerandoAgora) cancelar(g); }}
      chipMenu={{ label: "Formato", title: "Formato da imagem", icon: <Ratio aria-hidden="true" />, value: prefs.formato, options: IMG_FORMATOS, keepLabel: true, onChange: (v) => setPrefs({ ...prefs, formato: v as ImageFormato }) }} />
  );
  const abas = (lista.length > 0 || conversa.length > 0) && (
    <div className="x-w760 h-img-barra">
      <GlassSegmented label="Ver" size="sm" value={aba} onValueChange={(v) => setAba(v as AbaImg)}
        options={[{ value: "criar", label: "Criar" }, { value: "galeria", label: lista.length ? `Galeria · ${lista.length}` : "Galeria" }]} />
      <span className="x-sp" />
      {aba === "criar" && feed.length + fila.length > 0 && <button className="x-btn sm g" onClick={apagarConversa}><Trash2 size={15} />Apagar conversa</button>}
      {aba === "galeria" && lista.length > 0 && <button className="x-btn sm g" onClick={apagarTodas}><Trash2 size={15} />Apagar todas</button>}
    </div>
  );

  return (
    <div className="x-col x-grow">
      {abas}
      {aba === "galeria" ? (
        <div className="x-scroll h-img-feed"><div className="x-w760">
          {lista.length === 0 ? (
            <div className="h-gal-vazia"><p className="x-tx2">Nenhuma imagem ainda. As que você criar aqui ou no chat aparecem nesta galeria.</p>
              <button className="x-btn sm" onClick={() => setAba("criar")}>Criar uma imagem</button></div>
          ) : (
            <div className="h-gal">
              {lista.map((i) => (
                <div key={i.id} className="h-gal-item">
                  <button className="h-gal-ver" onClick={() => setAberta(i)} aria-label={`Abrir: ${i.prompt}`}><img src={i.src} alt={i.prompt} loading="lazy" /></button>
                  <button className="x-ib h-gal-apagar" onClick={() => apagar(i)} aria-label="Apagar imagem" title="Apagar imagem"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="h-rodape h-gal-nota">As imagens ficam só neste aparelho, até {IMG_MAX}. As mais antigas saem quando passa disso.</p>
        </div></div>
      ) : feed.length + fila.length === 0 ? (
        <div className="hx-start hx-start-burn h-burn">
          <StartBurn suggestions={IMG_SUGESTOES} onPick={(t) => gerar(t)} go={<ArrowRight className="hx-burn-go" aria-hidden="true" />}
            composer={<>{caixaImg("Descreva a imagem. Nada aqui pede licença")}<p className="h-uso">{IMG_MODELO.note}{pro ? "" : " No Grátis, o número de imagens por dia é limitado."}</p></>} />
        </div>
      ) : (
        <>
          <div className="x-scroll h-img-feed"><div className="x-w760 x-thread">
            {feed.map((i) => (
              <div key={i.id} className="h-img-msg">
                <div className="x-eu h-eu-curto">{i.prompt}</div>
                <button className="h-img-ver-btn" style={{ aspectRatio: proporcao(i.formato) }} onClick={() => setAberta(i)} aria-label="Abrir imagem"><img className="h-img-gerada" src={i.src} alt={i.prompt} loading="lazy" /></button>
                <div className="h-img-acoes">
                  <a className="x-btn sm" href={i.src} download={nomeArquivo(i.src)}><Download size={15} />Baixar</a>
                  <button className="x-btn sm g" onClick={() => gerar(i.prompt, { estilo: i.estilo, formato: i.formato, final: i.final })}><RefreshCw size={15} />Variar</button>
                  <button className="x-btn sm g" onClick={() => apagar(i)}><Trash2 size={15} />Apagar</button>
                  {!!i.creditos && <span className="x-mono x-mu h-img-cred" title="A cota de imagens do plano acabou: esta saiu dos créditos">{i.creditos} créditos</span>}
                </div>
                {!!i.sugestoes?.length && <div className="x-chips h-img-sug">{i.sugestoes.map((s) => <button key={s} className="x-chip" onClick={() => editar(i, s)}>{s}</button>)}</div>}
              </div>
            ))}
            {fila.map((g) => (
              <div key={g.id} className="h-img-msg">
                <div className="x-eu h-eu-curto">{g.prompt}</div>
                {g.erro ? <div className="h-img-acoes"><p className={g.idade ? "x-tx2" : "h-erro"}>{g.idade ? "O pedido tem nudez entre adultos. Confirme que você tem 18 anos ou mais para gerar." : g.erro}</p>
                  {g.idade && <button className="x-btn sm" onClick={() => { setPrefs({ ...prefs, adulto: true }); setFila((f) => f.filter((x) => x.id !== g.id)); gerar(g.prompt, { confirmAge: true }); }}>Tenho 18 anos ou mais</button>}
                  {!g.idade && /Pro\./.test(g.erro) && <button className="x-btn sm" onClick={onUpsell}>Ver o Pro</button>}
                  <button className="x-btn sm g" onClick={() => setFila((f) => f.filter((x) => x.id !== g.id))}>Fechar</button></div>
                  : <><div className="h-img-espera" style={{ aspectRatio: proporcao(g.formato) }}><TextShimmer>Gerando a imagem</TextShimmer></div>
                    <div className="h-img-acoes"><button className="x-btn sm g h-cancelar" onClick={() => cancelar(g)}><Fechar size={15} />Cancelar</button></div></>}
              </div>
            ))}
            <div ref={fundo} />
          </div></div>
          <div className="x-foot h-foot"><div className="h-fumaca" aria-hidden="true" /><div className="x-w760 x-gap10 h-foot-in">
            {caixaImg("Próxima imagem. Descreva")}
            <p className="h-rodape">As imagens ficam só neste aparelho. Nada sexual com menor de idade ou com pessoa real.</p>
          </div></div>
        </>
      )}

      <AnimatePresence>
        {aberta && (
          <motion.div className="h-img-ver" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAberta(null)}>
            <motion.div className="h-img-ver-in" initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }} transition={{ type: "spring", duration: 0.35, bounce: 0 }} onClick={(e) => e.stopPropagation()}>
              <img src={aberta.src} alt={aberta.prompt} />
              <p className="x-tx2 h-img-ver-p">{aberta.prompt}</p>
              <form className="h-img-form" onSubmit={(e) => { e.preventDefault(); editar(aberta, pedidoEd); }}>
                <input className="m-campo h-input" placeholder="Pedir uma mudança: deixe o céu roxo" value={pedidoEd} onChange={(e) => setPedidoEd(e.target.value)} aria-label="Mudança na imagem" maxLength={1500} />
                <button className="x-btn sm" type="submit" disabled={!pedidoEd.trim()}><RefreshCw size={15} />Editar</button>
              </form>
              <div className="h-img-acoes">
                <a className="x-btn sm" href={aberta.src} download={nomeArquivo(aberta.src)}><Download size={15} />Baixar</a>
                <button className="x-btn sm g" onClick={() => apagar(aberta)}><Trash2 size={15} />Apagar</button>
                <span className="x-sp" />
                <button className="x-btn sm g" onClick={() => setAberta(null)} aria-label="Fechar"><Fechar size={15} /></button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Bloqueio({ icone, titulo, texto, onPro }: { icone: ReactNode; titulo: string; texto: string; onPro?: () => void }) {
  return (
    <div className="x-center"><div className="h-bloq">
      <span className="h-bloq-ic">{icone}</span>
      <h1 className="p-h1">{titulo}</h1>
      <p className="x-tx2">{texto}</p>
      {onPro && <><button className="x-btn p" onClick={onPro}>Liberar no Pro · R$ 59,90</button><span className="x-mu h-up-pg">Pix, cripto ou créditos da sua chave</span></>}
    </div></div>
  );
}

