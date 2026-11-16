const API = "/api";

export interface Project { id: number; name: string; created_at: string }
export interface Conversation { id: number; title: string; updated_at: string; project_id?: number | null }
export interface Msg { role: "user" | "assistant" | "system"; content: string }
export interface ModelInfo { id: string; label: string; price_in: number; price_out: number; uncensored: boolean }
export type Mode = "chat" | "agent" | "heavy";
export type Routes = Record<Mode, { model: string }>;
export interface RouteInfo { model: string; provider: string; maxCtx: number; tools: boolean; uncensored: boolean; label: string }
export interface MeModel { id: string; name: string; short: string; note: string; tier: "free" | "pro"; locked: boolean; provider?: string; cost100?: number | null }
export interface Usage { used: number; limit: number; remaining: number }
export interface Me extends Usage { plan: string; models: MeModel[] }
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
const KEY_STORE = "heretic-key";
export function getKey(): string {
  try { return localStorage.getItem(KEY_STORE) || ""; } catch { return ""; }
}
export function setKey(code: string) {
  try { if (code) localStorage.setItem(KEY_STORE, code); else localStorage.removeItem(KEY_STORE); } catch { /* private mode */ }
}
/** Headers to send on every API call, carrying the access key when set. */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra || {}) };
  const k = getKey();
  if (k) h["x-heretic-key"] = k;
  return h;
}

export const api = {
  me: () => fetch(`${API}/me`, { headers: authHeaders() }).then(j<Me>),
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
  onUsage?: (usage: Usage) => void;
}

const REFUSALS: Record<string, string> = {
  daily_token_limit: "You've used today's free tokens. They reset at midnight UTC.",
  pro_model: "This model is part of Pro.",
};

/** Abre o SSE de /api/chat e repassa os eventos. Retorna o AbortController para parar. */
export function streamChat(
  body: { conversationId: number; mode: Mode; messages: Msg[]; params: ChatParams; agent?: string; model?: string; quality?: boolean },
  h: StreamHandlers,
): AbortController {
  const ctrl = new AbortController();
  (async () => {
    let full = "";
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; used?: number; limit?: number };
        const code = data.error;
        if (res.status === 429 && typeof data.used === "number" && typeof data.limit === "number") {
          h.onUsage?.({ used: data.used, limit: data.limit, remaining: Math.max(0, data.limit - data.used) });
        }
        const message = (code ? REFUSALS[code] : undefined)
          ?? (res.status === 429 ? REFUSALS.daily_token_limit! : res.status === 403 ? REFUSALS.pro_model! : data.message ?? code ?? `${res.status} ${res.statusText}`);
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
            else if (event === "usage" && typeof data.used === "number" && typeof data.limit === "number") h.onUsage?.({ used: data.used, limit: data.limit, remaining: typeof data.remaining === "number" ? data.remaining : Math.max(0, data.limit - data.used) });
            else if (event === "error") h.onError?.(data.message ?? "Something went wrong");
            else if (event === "done") h.onDone?.(data.content || full);
          } catch { /* linha parcial */ }
        }
      }
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") h.onError?.(err.message);
      else h.onDone?.(full);
    }
  })();
  return ctrl;
}
