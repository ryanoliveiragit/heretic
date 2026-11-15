import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/registry/components/button/button";
import SegmentedControl from "@/registry/components/segmented-control/segmented-control";
import { PromptInput } from "@/registry/components/prompt-input/prompt-input";
import type { PromptModel } from "@/registry/components/prompt-input/prompt-input";
import { Message } from "@/registry/components/message/message";
import { MessageScroller } from "@/registry/components/message-scroller/message-scroller";
import { MessageBubble } from "@/registry/components/message-bubble/message-bubble";
import { Badge } from "@/registry/components/badge/badge";
import { Avatar } from "@/registry/components/avatar/avatar";
import { EmptyState } from "@/registry/components/empty-state/empty-state";
import { Dialog, DialogContent } from "@/registry/components/dialog/dialog";
import { Slider } from "@/registry/components/slider/slider";
import { Tooltip } from "@/registry/components/tooltip/tooltip";
import { MetricCard } from "@/registry/components/metric-card/metric-card";
import { UserMenu } from "@/registry/components/user-menu/user-menu";
import { AgentActivity } from "@/registry/components/agent-activity/agent-activity";
import { ThinkingShimmer } from "@/registry/components/loading-states/loading-states";

import {
  api, streamChat,
  type Project, type Conversation, type Msg, type ModelInfo, type Mode, type Routes, type ChatParams, type Health,
} from "./api";

const MODES: { value: Mode; label: string }[] = [
  { value: "chat", label: "💬 Chat" },
  { value: "agent", label: "🛠️ Agent" },
  { value: "heavy", label: "🧠 Heavy" },
];

const BOT_EMOJI = "😈";

type ChatRow = { id: string; role: "user" | "assistant"; content: string; streaming?: boolean };

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

function shortModel(label?: string): string {
  if (!label) return "—";
  return label.replace(/🔓|🚫/g, "").replace(/SEM CENSURA REAL/i, "").replace(/\s+/g, " ").trim();
}

export function App() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [projects, setProjects] = useState<Project[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [convId, setConvId] = useState<number | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [routes, setRoutes] = useState<Routes | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [mode, setMode] = useState<Mode>((localStorage.getItem("heretic-mode") as Mode) || "chat");
  const [params, setParams] = useState<ChatParams>({ temperature: 1, top_p: 1, max_tokens: 4096 });
  const [streaming, setStreaming] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [persona, setPersona] = useState("");
  const [personaOpen, setPersonaOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  const refreshProjects = useCallback(async () => setProjects(await api.projects()), []);
  const refreshConvs = useCallback(async (pid: number | null) => setConvs(await api.conversations(pid)), []);
  const refreshHealth = useCallback(async () => { try { setHealth(await api.health()); } catch { /* ignore */ } }, []);

  useEffect(() => {
    (async () => {
      const [m, r] = await Promise.all([api.models(), api.routes()]);
      setModels(m); setRoutes(r);
      await Promise.all([refreshProjects(), refreshConvs(null), refreshHealth()]);
      try { setPersona((await api.persona()).content); } catch { /* opcional */ }
    })();
  }, [refreshProjects, refreshConvs, refreshHealth]);

  const openConv = useCallback(async (id: number) => {
    setConvId(id);
    setMenuOpen(false);
    const msgs = await api.messages(id);
    setRows(msgs.filter((m) => m.role !== "system").map((m, i) => ({
      id: `h${i}`, role: m.role as "user" | "assistant", content: m.content,
    })));
  }, []);

  const newProject = async () => {
    const name = window.prompt("Nome do projeto:");
    if (!name) return;
    const p = await api.createProject(name);
    await refreshProjects();
    setProjectId(p.id);
    await refreshConvs(p.id);
  };

  const selectProject = async (id: number | null) => {
    setProjectId(id); setConvId(null); setRows([]);
    await refreshConvs(id);
  };

  const newConv = () => { setConvId(null); setRows([]); setMenuOpen(false); };

  const removeConv = async (id: number) => {
    await api.deleteConversation(id);
    if (convId === id) { setConvId(null); setRows([]); }
    await refreshConvs(projectId);
  };

  const promptModels: PromptModel[] = useMemo(() => models.map((m) => ({
    id: m.id,
    label: `${m.uncensored ? "🔓" : "🚫"} ${m.label}`,
    description: m.price_in === 0 ? "grátis" : `$${m.price_in}/${m.price_out} por M · ${m.uncensored ? "sem censura" : "censurado"}`,
  })), [models]);

  const activeModel = routes?.[mode]?.model ?? "";
  const activeModelInfo = models.find((m) => m.id === activeModel);
  const routeInfo = health?.routes?.[mode];

  const changeModel = async (model: string) => {
    await api.setRoute(mode, model);
    setRoutes((prev) => (prev ? { ...prev, [mode]: { model } } : prev));
    refreshHealth();
  };

  const onModeChange = (v: string) => { setMode(v as Mode); localStorage.setItem("heretic-mode", v); };
  const stop = () => { ctrlRef.current?.abort(); };

  const send = async (text: string) => {
    const value = text.trim();
    if (!value || streaming) return;

    let cid = convId;
    if (!cid) {
      const conv = await api.createConversation(projectId, value.slice(0, 40));
      cid = conv.id; setConvId(cid);
      await refreshConvs(projectId);
    }

    const history: Msg[] = (await api.messages(cid)).filter((m) => m.role !== "system");
    history.push({ role: "user", content: value });

    const userRow: ChatRow = { id: `u${Date.now()}`, role: "user", content: value };
    const aiId = `a${Date.now()}`;
    setRows((r) => [...r, userRow, { id: aiId, role: "assistant", content: "", streaming: true }]);
    setStreaming(true); setWaiting(true);

    ctrlRef.current = streamChat(
      { conversationId: cid, mode, messages: history, params },
      {
        onToken: (full) => {
          setWaiting(false);
          setRows((r) => r.map((row) => (row.id === aiId ? { ...row, content: full } : row)));
        },
        onError: (message) => {
          setRows((r) => r.map((row) => (row.id === aiId ? { ...row, content: `⚠️ ${message}`, streaming: false } : row)));
          setStreaming(false); setWaiting(false);
        },
        onDone: (content) => {
          setRows((r) => r.map((row) => (row.id === aiId ? { ...row, content: content || row.content, streaming: false } : row)));
          setStreaming(false); setWaiting(false);
          refreshConvs(projectId); refreshHealth();
        },
      },
    );
  };

  const savePersona = async () => { await api.setPersona(persona); setPersonaOpen(false); };

  const used = health?.daily_requests ?? 0;
  const limit = health?.daily_limit ?? 0;

  return (
    <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
      <div className="backdrop" onClick={() => setMenuOpen(false)} aria-hidden />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-emoji" aria-hidden>{BOT_EMOJI}</span>
          <span className="brand-name">Heretic</span>
          <Badge tone="success" size="sm" dot pill className="brand-live">no ar</Badge>
        </div>

        <Button variant="primary" size="sm" className="new-project" onClick={newProject}>
          <span aria-hidden>📁</span> Novo projeto
        </Button>

        <div className="rail-section">
          <div className="rail-title">Projetos</div>
          <button className={`rail-item ${projectId === null ? "active" : ""}`} onClick={() => selectProject(null)}>
            <span className="rail-emoji" aria-hidden>🗂️</span>
            <span className="rail-item-name">Todos</span>
          </button>
          {projects.map((p) => (
            <button key={p.id} className={`rail-item ${projectId === p.id ? "active" : ""}`} onClick={() => selectProject(p.id)}>
              <span className="rail-emoji" aria-hidden>📁</span>
              <span className="rail-item-name">{p.name}</span>
            </button>
          ))}
        </div>

        <div className="rail-section grow">
          <div className="rail-title">
            Conversas
            <Tooltip content="Nova conversa">
              <button className="rail-add" aria-label="Nova conversa" onClick={newConv}><span aria-hidden>✏️</span></button>
            </Tooltip>
          </div>
          {convs.length === 0 && <div className="rail-empty">Nenhuma conversa ainda</div>}
          {convs.map((c) => (
            <div key={c.id} className={`rail-item conv ${convId === c.id ? "active" : ""}`}>
              <Avatar name={c.title || "?"} size="sm" />
              <button className="rail-item-name" onClick={() => openConv(c.id)}>
                <span className="conv-title">{c.title}</span>
                <span className="conv-time">{timeAgo(c.updated_at)}</span>
              </button>
              <button className="rail-del" aria-label="Apagar" onClick={() => removeConv(c.id)}><span aria-hidden>🗑️</span></button>
            </div>
          ))}
        </div>

        <div className="rail-footer">
          <UserMenu
            user={{ name: "Você", email: "🔓 sem censura" }}
            showName
            showTheme
            theme={theme}
            onThemeChange={(t) => { if (t !== "system") setTheme(t); }}
            align="start"
            items={[
              { label: "Persona do sistema", onSelect: () => setPersonaOpen(true) },
              { label: "Parâmetros de geração", onSelect: () => setParamsOpen(true) },
              { label: "Uso & modelo", onSelect: () => setInfoOpen(true) },
            ]}
          />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-btn" aria-label="Abrir conversas" onClick={() => setMenuOpen(true)}><span aria-hidden>☰</span></button>
            <SegmentedControl options={MODES} value={mode} onValueChange={onModeChange} label="Modo" />
          </div>
          <div className="topbar-right">
            <Badge tone="neutral" size="sm" outline pill className="pill-model">{shortModel(activeModelInfo?.label)}</Badge>
            <Badge tone={activeModelInfo?.uncensored ? "success" : "warning"} size="sm" pill>
              {activeModelInfo?.uncensored ? "🔓 sem censura" : "🚫 censurado"}
            </Badge>
            {limit > 0 && (
              <Tooltip content={`${used} de ${limit} requisições hoje`}>
                <Badge tone="neutral" size="sm" pill className="pill-usage">⚡ {used}/{limit}</Badge>
              </Tooltip>
            )}
            <button className="info-btn" aria-label="Uso e modelo" onClick={() => setInfoOpen(true)}><span aria-hidden>📊</span></button>
          </div>
        </header>

        <section className="chat">
          {rows.length === 0 ? (
            <div className="chat-empty">
              <EmptyState
                icon={<span className="empty-emoji" aria-hidden>🕯️</span>}
                title="Sem filtro"
                description="Escolha o modo, o modelo e mande a primeira mensagem."
              />
            </div>
          ) : (
            <MessageScroller className="scroller">
              {rows.map((row) =>
                row.role === "user" ? (
                  <div className="row-user" key={row.id}>
                    <MessageBubble from="user">{row.content}</MessageBubble>
                  </div>
                ) : (
                  <div className="row-ai" key={row.id}>
                    {row.streaming && !row.content ? (
                      mode === "agent" ? (
                        <AgentActivity
                          defaultExpanded
                          title="Agente trabalhando"
                          steps={[{ id: "gen", kind: "think", title: "Raciocinando", detail: "gerando a resposta", status: "running" }]}
                        />
                      ) : (
                        <div className="thinking"><span className="bot-avatar" aria-hidden>{BOT_EMOJI}</span><ThinkingShimmer label="Pensando…" /></div>
                      )
                    ) : (
                      <Message
                        name="Heretic"
                        avatar={<span className="bot-avatar" aria-hidden>{BOT_EMOJI}</span>}
                        content={row.content}
                        actions={row.streaming ? "none" : "hover"}
                        animateIn={false}
                      />
                    )}
                  </div>
                ),
              )}
            </MessageScroller>
          )}
        </section>

        <footer className="composer">
          <PromptInput
            placeholder={`Mensagem para o modo ${mode}…`}
            models={promptModels}
            model={activeModel}
            onModelChange={changeModel}
            running={streaming}
            onStop={stop}
            onSubmit={(s) => send(s.value)}
          />
          <div className="composer-foot">
            <span>{waiting ? "⏳ conectando ao modelo…" : "Enter envia · Shift+Enter quebra linha"}</span>
            {routeInfo && <span className="foot-ctx">janela {Math.round((routeInfo.maxCtx || 0) / 1000)}k · {routeInfo.provider}</span>}
          </div>
        </footer>
      </main>

      {/* Persona */}
      <Dialog open={personaOpen} onOpenChange={setPersonaOpen}>
        <DialogContent title="📝 Persona do sistema" description="Editada ao vivo: a próxima resposta já usa o novo texto.">
          <textarea className="persona-area" value={persona} onChange={(e) => setPersona(e.target.value)} rows={14} />
          <div className="dialog-actions">
            <Button variant="ghost" size="sm" onClick={() => setPersonaOpen(false)}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={savePersona}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Params */}
      <Dialog open={paramsOpen} onOpenChange={setParamsOpen}>
        <DialogContent title="⚙️ Parâmetros de geração" description="Valem para a próxima mensagem.">
          <div className="params">
            <Slider label="Temperatura" min={0} max={2} step={0.1} value={params.temperature}
              onValueChange={(v) => setParams({ ...params, temperature: v as number })} format={(n) => n.toFixed(1)} />
            <Slider label="Top-p" min={0} max={1} step={0.05} value={params.top_p}
              onValueChange={(v) => setParams({ ...params, top_p: v as number })} format={(n) => n.toFixed(2)} />
            <Slider label="Máx. tokens" min={256} max={8192} step={256} value={params.max_tokens}
              onValueChange={(v) => setParams({ ...params, max_tokens: v as number })} format={(n) => String(n)} />
          </div>
          <div className="dialog-actions">
            <Button variant="primary" size="sm" onClick={() => setParamsOpen(false)}>Pronto</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Info */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent title="📊 Uso & modelo" description="Modelo ativo e consumo de hoje.">
          <div className="info-grid">
            <MetricCard label="Requisições hoje" value={used} context={`de ${limit || "∞"}`} />
            <MetricCard label="Janela de contexto" value={Math.round((routeInfo?.maxCtx || 0) / 1000)} suffix="k" context="tokens" />
          </div>
          <div className="info-rows">
            <div className="info-row"><span>Modo</span><b>{mode}</b></div>
            <div className="info-row"><span>Modelo</span><b>{shortModel(activeModelInfo?.label)}</b></div>
            <div className="info-row"><span>Provedor</span><b>{routeInfo?.provider ?? "—"}</b></div>
            <div className="info-row"><span>Preço</span><b>{activeModelInfo ? (activeModelInfo.price_in === 0 ? "grátis" : `$${activeModelInfo.price_in}/${activeModelInfo.price_out} por M`) : "—"}</b></div>
            <div className="info-row"><span>Censura</span><b>{activeModelInfo?.uncensored ? "🔓 sem censura" : "🚫 censurado"}</b></div>
            <div className="info-row"><span>Ferramentas</span><b>{routeInfo?.tools ? "sim" : "não"}</b></div>
          </div>
          <div className="info-providers">
            {Object.entries(health?.providers ?? {}).map(([name, p]) => (
              <Badge key={name} tone={p.ok ? "success" : "danger"} size="sm" dot pill>{name}</Badge>
            ))}
          </div>
          <div className="dialog-actions">
            <Button variant="primary" size="sm" onClick={() => setInfoOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
