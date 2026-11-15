const API = "/api";

export interface Project { id: number; name: string; created_at: string }
export interface Conversation { id: number; title: string; updated_at: string; project_id?: number | null }
export interface Msg { role: "user" | "assistant" | "system"; content: string }
export interface ModelInfo { id: string; label: string; price_in: number; price_out: number; uncensored: boolean }
export type Mode = "chat" | "agent" | "heavy";
export type Routes = Record<Mode, { model: string }>;
export interface RouteInfo { model: string; provider: string; maxCtx: number; tools: boolean; uncensored: boolean; label: string }
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

export const api = {
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
  onError?: (message: string) => void;
  onDone?: (content: string) => void;
}

/** Abre o SSE de /api/chat e repassa os eventos. Retorna o AbortController para parar. */
export function streamChat(
  body: { conversationId: number; mode: Mode; messages: Msg[]; params: ChatParams },
  h: StreamHandlers,
): AbortController {
  const ctrl = new AbortController();
  (async () => {
    let full = "";
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.body) throw new Error("sem corpo de resposta");
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
            else if (event === "warning") h.onWarning?.(data);
            else if (event === "error") h.onError?.(data.message ?? "erro");
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
