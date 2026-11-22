const API = "/api";

export interface Project { id: number; name: string; created_at: string }
export interface Conversation { id: number; title: string; updated_at: string; project_id?: number | null }
export interface WireAttachment { kind: "image" | "pdf"; name: string; mime: string; data: string }
export interface Msg { role: "user" | "assistant" | "system"; content: string; attachments?: WireAttachment[] }
export interface ModelInfo { id: string; label: string; price_in: number; price_out: number; uncensored: boolean }
export type Mode = "chat" | "agent" | "heavy";
export type Routes = Record<Mode, { model: string }>;
export interface RouteInfo { model: string; provider: string; maxCtx: number; tools: boolean; uncensored: boolean; label: string }
export interface ModelGuide { role: string; bestFor: string; style: string; limits: string[]; fallback: string; tested: string }
export interface MeModel { id: string; name: string; short: string; note: string; tier: "free" | "pro"; locked: boolean; provider?: string; cost100?: number | null; ctx?: number | null; guide?: ModelGuide; bucket?: string }
export type QuotaResource = "messages" | "image_gen" | "image_upload" | "files";
export interface QuotaWindow { id: "5h" | "day" | "week" | "month"; label: string; limit: number; used: number; remaining: number; resetAt: number | null }
export interface Quota { resource: QuotaResource; bucket: string; available: boolean; windows: QuotaWindow[]; remaining: number; blocked: boolean; blockedBy: string | null; resetAt: number | null }
export type LimitTable = Record<QuotaResource, Record<string, Record<QuotaWindow["id"], number>>>;
export interface Me { plan: string; store?: string; models: MeModel[]; quotas: Quota[]; limits?: LimitTable }

export const RESOURCE_LABEL: Record<QuotaResource, string> = { messages: "Mensagens", image_gen: "Imagens geradas", image_upload: "Imagens enviadas", files: "Arquivos" };
const RESOURCE_NOUN: Record<QuotaResource, string> = { messages: "mensagens", image_gen: "imagens geradas", image_upload: "imagens enviadas", files: "arquivos" };
const WINDOW_NOUN: Record<string, string> = { "5h": "de 5 horas", day: "do dia", week: "da semana", month: "do mês" };

/** Janela mais perto de esgotar. */
export function tightestWindow(quota: Quota): QuotaWindow | null {
  const open = quota.windows.filter(w => w.limit > 0);
  return open.length ? open.reduce((a, b) => (b.used / b.limit > a.used / a.limit ? b : a)) : null;
}
/** "às 17h42" hoje; "em 20/11 às 17h42" nos outros dias. */
export function formatReset(ts: number | null): string {
  if (!ts) return "em breve";
  const d = new Date(ts);
  const hour = `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? `às ${hour}` : `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hour}`;
}
/** Aviso em português para quem chegou no limite de um recurso. */
export function quotaMessage(quota: Quota, requested = 1): string {
  const noun = RESOURCE_NOUN[quota.resource];
  if (!quota.available) return quota.resource === "image_upload" ? "Envio de imagem faz parte dos modelos Pro." : `Este modelo não tem ${noun}.`;
  if (!quota.blocked && requested > quota.remaining) return `Você pediu ${requested} ${noun}, mas restam ${quota.remaining} agora.`;
  const when = formatReset(quota.resetAt);
  return `Você atingiu o limite ${WINDOW_NOUN[quota.blockedBy || "5h"]} de ${noun}. Libera ${when}.`;
}
export interface Health {
  ok: boolean;
  providers?: Record<string, { ok: boolean }>;
  daily_requests?: number;
  daily_limit?: number;
  routes?: Record<Mode, RouteInfo>;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── access key ── (free is public; a valid code unlocks Pro)
// Rebrand 451: a chave passou a ser guardada em "451-key". Migramos quem tinha o nome antigo
// ("heretic-key") na primeira leitura, para NINGUÉM ser deslogado ao atualizar o app.
const KEY_STORE = "451-key";
const LEGACY_KEY_STORE = "heretic-key";
export function getKey(): string {
  try {
    let v = localStorage.getItem(KEY_STORE) || "";
    if (!v) {
      const old = localStorage.getItem(LEGACY_KEY_STORE) || "";
      if (old) { try { localStorage.setItem(KEY_STORE, old); localStorage.removeItem(LEGACY_KEY_STORE); } catch { /* ignore */ } v = old; }
    }
    return v;
  } catch { return ""; }
}
export function setKey(code: string) {
  try {
    if (code) localStorage.setItem(KEY_STORE, code); else localStorage.removeItem(KEY_STORE);
    localStorage.removeItem(LEGACY_KEY_STORE);
  } catch { /* private mode */ }
}
// Impressão de dispositivo (anti-burla do limite grátis): derivada de sinais estáveis do navegador,
// então sobrevive a limpar o cache/navegação anônima (mesmo navegador = mesma impressão). Trocar
// exige outro navegador/aparelho. O servidor cruza isto com o IP.
let _fp = "";
export function deviceId(): string {
  if (_fp) return _fp;
  try {
    const n = navigator;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const s = [n.userAgent, n.language, tz, `${screen.width}x${screen.height}x${screen.colorDepth}`, String(n.hardwareConcurrency || ""), (n as Navigator & { platform?: string }).platform || "", String((n as Navigator & { deviceMemory?: number }).deviceMemory || "")].join("|");
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    _fp = "fp" + h.toString(36);
  } catch { _fp = "fp0"; }
  return _fp;
}

/** Headers to send on every API call, carrying the access key and the device fingerprint. */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra || {}) };
  const k = getKey();
  if (k) h["x-451-key"] = k;
  try { h["x-451-client"] = deviceId(); } catch { /* ignore */ }
  return h;
}

export type ImageEstilo = "rapido" | "realista" | "sem-filtro" | "anime";
export type ImageFormato = "auto" | "1:1" | "3:4" | "9:16" | "16:9";
export interface ImageOpts { estilo?: ImageEstilo; formato?: ImageFormato; melhorar?: boolean; final?: string; seed?: number; confirmAge?: boolean }
export interface ImageResult { image: string; token?: string; creditos?: number; quotas?: Quota[]; prompt?: string; seed?: number; estilo?: ImageEstilo; formato?: ImageFormato; model?: string; provider?: string }
/** Imagem de referência para edição: `token` é a marca do 451 (só imagens geradas aqui aceitam edição adulta). */
export interface ImageRef { src: string; token?: string }
export interface ImageIntent { intent: "text" | "new_image" | "edit_image" | "bloqueado"; prompt?: string; adulto?: boolean; formato?: ImageFormato | ""; message?: string; unavailable?: boolean }
export class LimitError extends Error { quota: Quota; constructor(quota: Quota) { super("limit_reached"); this.quota = quota; } }
/** Erro com texto pronto para a tela (bloqueio, estilo do Pro). */
export class ImageError extends Error { code: string; constructor(code: string, message?: string) { super(message || code); this.code = code; } }
/* A rota de imagem transmite espaços até o JSON final (geração longa); erros dessa fase vêm com status 200. */
async function imageJson(res: Response): Promise<ImageResult> {
  const d = (await res.json().catch(() => ({}))) as ImageResult & { error?: string; message?: string; quota?: Quota };
  if (d.quota && d.error === "limit_reached") throw new LimitError(d.quota);
  if (!res.ok || d.error || !d.image) throw new ImageError(d.error || `${res.status}`, d.message);
  return d;
}

export const api = {
  me: () => fetch(`${API}/me`, { headers: authHeaders() }).then(j<Me>),
  image: (prompt: string, opts: ImageOpts = {}, signal?: AbortSignal) =>
    fetch(`${API}/image`, {
      method: "POST", signal,
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prompt, ...opts }),
    }).then(imageJson),
  editImage: (prompt: string, images: ImageRef[], opts: { final?: string; base?: string; adulto?: boolean; confirmAge?: boolean; formato?: ImageFormato } = {}, signal?: AbortSignal) =>
    fetch(`${API}/image/edit`, {
      method: "POST", signal,
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prompt, images, ...opts }),
    }).then(imageJson),
  imageIntent: (text: string, contexto: { role: "user" | "assistant"; text: string; img?: boolean }[], temImagem: boolean, signal?: AbortSignal) =>
    fetch(`${API}/image/intent`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text, contexto, temImagem }),
      signal,
    }).then((r) => (r.ok ? (r.json() as Promise<ImageIntent>) : Promise.reject(new Error(`${r.status}`)))),
  imageFollowups: (prompt: string) =>
    fetch(`${API}/image/followups`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.json() as Promise<{ suggestions?: string[] }>).then((d) => d.suggestions ?? []).catch(() => [] as string[]),
  upscale: (image: string) =>
    fetch(`${API}/image/upscale`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ image }),
    }).then(imageJson),
  redeem: (code: string) =>
    fetch(`${API}/redeem`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ code }),
    }).then(j<{ ok: boolean; plan: string }>),
  checkout: () =>
    fetch(`${API}/checkout`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    }).then(j<{ ok: boolean; plan: string; code: string }>),
  health: () => fetch(`${API}/health`).then(j<Health>),
  models: () => fetch(`${API}/models`).then(j<ModelInfo[]>),
  routes: () => fetch(`${API}/routes`).then(j<Routes>),
  setRoute: (mode: Mode, model: string) =>
    fetch(`${API}/routes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, model }),
    }).then(j<{ model: string }>),

  projects: () => fetch(`${API}/projects`).then(j<Project[]>),
  createProject: (name: string) =>
    fetch(`${API}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(j<Project>),
  deleteProject: (id: number) => fetch(`${API}/projects/${id}`, { method: "DELETE" }),

  conversations: (projectId?: number | null) =>
    fetch(`${API}/conversations?projectId=${projectId ?? ""}`).then(j<Conversation[]>),
  createConversation: (project_id: number | null, title: string) =>
    fetch(`${API}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id, title }),
    }).then(j<Conversation>),
  deleteConversation: (id: number) => fetch(`${API}/conversations/${id}`, { method: "DELETE" }),

  messages: (convId: number) =>
    fetch(`${API}/conversations/${convId}/messages`).then(j<Msg[]>),

  persona: () => fetch(`${API}/persona`).then(j<{ content: string }>),
  setPersona: (content: string) =>
    fetch(`${API}/persona`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),

  approve: (approve: boolean, id?: string) =>
    fetch(`${API}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, id }),
    }),
};

export interface ChatParams { temperature: number; top_p: number; max_tokens: number }
export interface StreamHandlers {
  onToken: (full: string) => void;
  onWarning?: (data: unknown) => void;
  /** FORÇA TUDO: o servidor descartou uma recusa e re-rodou o modelo — o texto recomeça do zero. */
  onRefusalForced?: () => void;
  /** `status` is set when the server refused the request before streaming (e.g. 429, 403). */
  onError?: (message: string, info?: { status: number; code?: string }) => void;
  onDone?: (content: string) => void;
  onUsage?: (quotas: Quota[]) => void;
  /** Afinador: o servidor reescreveu o pedido antes de responder (Pro). Vem o original e o texto novo. */
  onEnhanced?: (original: string, text: string) => void;
}

const REFUSALS: Record<string, string> = {
  pro_model: "Este modelo faz parte do Pro.",
};

/** Abre o SSE de /api/chat e repassa os eventos. Retorna o AbortController para parar. */
export function streamChat(
  body: { conversationId: number; mode: Mode; messages: Msg[]; params: ChatParams; agent?: string; model?: string; quality?: boolean; enhance?: boolean; rapidPass?: boolean },
  h: StreamHandlers,
): AbortController {
  const ctrl = new AbortController();
  (async () => {
    let full = "";
    let terminou = false; // QA 20/11: a transmissão que acaba sem "done" nem "error" não pode deixar a tela girando
    const rede = (m: string) => (/failed to fetch|load failed|networkerror|network error|internet/i.test(m) ? "Sem conexão com o 451. Confira a internet e tente de novo." : m);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; quota?: Quota; requested?: number };
        const code = data.error;
        if (data.quota) h.onUsage?.([data.quota]);
        const message = data.quota ? quotaMessage(data.quota, data.requested)
          : (code ? REFUSALS[code] : undefined) ?? data.message ?? code ?? `${res.status} ${res.statusText}`;
        h.onError?.(message, { status: res.status, code });
        return;
      }
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let event = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { event = line.slice(7).trim(); continue; }
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (event === "token" && data.token) { full += data.token; h.onToken(full); }
            else if (event === "warning") {
              if ((data as { type?: string }).type === "refusal_forced") { full = ""; h.onRefusalForced?.(); }
              else h.onWarning?.(data);
            }
            else if (event === "enhanced" && typeof data.text === "string") h.onEnhanced?.(String(data.original ?? ""), data.text);
            else if (event === "usage" && Array.isArray(data.quotas)) h.onUsage?.(data.quotas as Quota[]);
            else if (event === "error") { terminou = true; h.onError?.(data.message ?? "Algo deu errado. Tente de novo."); }
            else if (event === "done") { terminou = true; h.onDone?.(data.content || full); }
          } catch { /* linha parcial */ }
        }
      }
      if (!terminou && !ctrl.signal.aborted) h.onError?.("A conexão caiu antes do fim da resposta. Tente de novo.");
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") h.onError?.(rede(err.message));
      else h.onDone?.(full);
    }
  })();
  return ctrl;
}
