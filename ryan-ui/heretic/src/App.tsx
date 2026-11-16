import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/registry/components/button/button";
import { SearchField } from "@/registry/components/search-field/search-field";
import { MessageBubble } from "@/registry/components/message-bubble/message-bubble";
import { ChipGroup } from "@/registry/components/chip-group/chip-group";
import { Slider } from "@/registry/components/slider/slider";
import { Progress } from "@/registry/components/progress/progress";
import { UserMenu } from "@/registry/components/user-menu/user-menu";
import { VoiceOrb } from "@pro/voice-orb/voice-orb";

import {
  api, streamChat,
  type Conversation, type Msg, type ModelInfo, type Mode, type Routes, type ChatParams, type Health,
} from "./api";

/* ── dados fixos ── */
type AgentId = "escritor" | "pesquisador" | "saude" | "direito" | "codigo" | "humor" | "seguranca" | "ctf";
const AGENTS: { id: AgentId; name: string; line: string; mascot: "ghost" | "cube" }[] = [
  { id: "escritor", name: "Writer", line: "Writes, cuts and critiques. No sugarcoating.", mascot: "ghost" },
  { id: "pesquisador", name: "Researcher", line: "Finds sources, compares them, sums up.", mascot: "cube" },
  { id: "saude", name: "Intrusion", line: "How they got in, and how you get back.", mascot: "ghost" },
  { id: "direito", name: "Law", line: "Laws and contracts in plain English.", mascot: "cube" },
  { id: "codigo", name: "Code", line: "Writes, reviews and debugs in your stack.", mascot: "ghost" },
  { id: "humor", name: "Dark humor", line: "Unfiltered jokes. Starting with you.", mascot: "cube" },
  { id: "seguranca", name: "Security", line: "Pentest and recon, in your lab or authorized scope.", mascot: "ghost" },
  { id: "ctf", name: "Crypto & CTF", line: "Applied crypto and CTF challenges.", mascot: "cube" },
];
// Onboarding (estilo Duolingo): 3 passos curtos na primeira visita — assunto, pergunta pronta, enviar.
const STARTERS: Record<AgentId, string[]> = {
  escritor: ["Tear apart the first paragraph of my draft", "Rewrite this shorter and punchier", "Give me 5 better titles for this article"],
  pesquisador: ["Compare the sources on this and tell me who disagrees", "What do we actually know about intermittent fasting?", "What are the best arguments against my idea?"],
  saude: ["They were in my server overnight. How do I find out how?", "Trace a brute-force login down to the source IP", "SSH keys or cron jobs — what leaves a trail first?"],
  direito: ["What's the difference between libel and slander?", "I got fired without cause. What are my rights?", "Does this contract have any unfair clauses?"],
  codigo: ["Review this function and find the bug", "Write a script that renames files by date", "Explain this TypeScript error"],
  humor: ["Roast me: I'm a dev and I wake up at 11am", "Roast my resume", "Write a satire about a meeting that should've been an email"],
  seguranca: ["Build a pentest plan for my 10.0.0.0/24 lab", "How do I harden an SSH server?", "Explain this CVE and how to test it in my environment"],
  ctf: ["Solve this Caesar cipher challenge", "What could be hidden in this image?", "Explain padding oracle attacks with an example"],
};

function Onboarding({ onPick, onSkip, mobile }: { onPick: (agent: AgentId, question: string) => void; onSkip: () => void; mobile: boolean }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [ag, setAg] = useState<AgentId | null>(null);
  const info = AGENTS.find((a) => a.id === ag);
  return (
    <section className="onb" aria-label="Getting started">
      <div className="onb-top">
        <div className="onb-bar" aria-hidden><i style={{ width: step === 1 ? "33%" : "66%" }} /></div>
        <button className="onb-skip" onClick={onSkip}>Skip</button>
      </div>
      {step === 1 ? (
        <>
          <p className="onb-kicker">Step 1 of 3</p>
          <h2 className="onb-title">What's your question about?</h2>
          <div className="onb-grid">
            {AGENTS.map((a) => (
              <button key={a.id} className="onb-card" onClick={() => { setAg(a.id); setStep(2); }}>
                <Mascot kind={a.mascot} size={mobile ? 28 : 32} />
                <strong>{a.name}</strong>
                {!mobile && <span>{a.line}</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="onb-kicker">Step 2 of 3 · {info?.name}</p>
          <h2 className="onb-title">Pick a question to start.</h2>
          <div className="onb-list">
            {(ag ? STARTERS[ag] : []).map((q) => (
              <button key={q} className="onb-q" onClick={() => ag && onPick(ag, q)}><span>{q}</span><span aria-hidden>→</span></button>
            ))}
          </div>
          <button className="onb-back" onClick={() => setStep(1)}>← Change topic</button>
        </>
      )}
    </section>
  );
}

const MODES: { value: Mode; label: string; line: string }[] = [
  { value: "chat", label: "Chat", line: "Fast, direct answers." },
  { value: "agent", label: "Agent", line: "Thinks in steps before answering." },
  { value: "heavy", label: "Heavy", line: "Bigger model for the hard stuff." },
];
const SUGGESTIONS = [
  { value: "Run recon on example.com: ports open, headers, what sticks out first.", label: "Recon my domain" },
  { value: "Rip apart the first paragraph I paste next. No mercy.", label: "Critique my writing" },
  { value: "Someone is DDoSing my API endpoint. What do I fix in the next ten minutes?", label: "Stop my DDoS" },
  { value: "Roast people who ask an AI for jokes at 3am.", label: "Roast me" },
];
const GLYPHS = "!<>-_\\/[]{}=+*^?#%&$@01";


// Every agent wears the same silver mask as on the landing page (kind is kept for the data, not drawn).
function Mascot({ kind, size }: { kind: "ghost" | "cube"; size: number }) {
  return <span className="mask" data-kind={kind} aria-hidden style={{ width: size, height: Math.round(size * 1.2) }} />;
}

function parseDate(iso: string): Date {
  const norm = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`;
  return new Date(norm);
}
const isToday = (iso: string) => parseDate(iso).toDateString() === new Date().toDateString();
const shortModel = (label?: string) => (label ?? "—").replace(/🔓|🚫/g, "").replace(/SEM CENSURA( REAL)?/i, "").replace(/\s+/g, " ").trim();
const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const useMobile = () => {
  const [m, setM] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
};

/* ── ditado: reconhecimento de voz do navegador (idioma do navegador, fallback en-US) ── */
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const RecCtor = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

function useDictation(onText: (text: string) => void) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Rec | null>(null);
  const textRef = useRef("");
  const doneRef = useRef<((t: string) => void) | null>(null);
  const start = useCallback(() => {
    if (!RecCtor || recRef.current) return;
    const r = new RecCtor();
    r.lang = navigator.language || "en-US"; r.interimResults = true; r.continuous = true;
    textRef.current = ""; setError(null);
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i]?.[0]?.transcript ?? "";
      textRef.current = t.trim(); onText(textRef.current);
    };
    r.onerror = (e) => { if (e.error !== "aborted" && e.error !== "no-speech") setError(e.error === "not-allowed" ? "Allow mic access to dictate." : "Couldn't hear you. Try again."); };
    r.onend = () => { recRef.current = null; setOn(false); const cb = doneRef.current; doneRef.current = null; cb?.(textRef.current); };
    recRef.current = r; setOn(true);
    try { r.start(); } catch { recRef.current = null; setOn(false); }
  }, [onText]);
  const stop = useCallback((then?: (t: string) => void) => {
    doneRef.current = then ?? null;
    if (recRef.current) recRef.current.stop(); else then?.(textRef.current);
  }, []);
  return { supported: !!RecCtor, on, error, start, stop };
}

/* ── resposta que se descriptografa ao chegar ── */
function Answer({ text, streaming, started }: { text: string; streaming: boolean; started: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!streaming) return;
    const t = window.setInterval(() => force((x) => x + 1), 50);
    return () => window.clearInterval(t);
  }, [streaming]);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!streaming || reduced) return <Rich text={text} />;

  const waiting = !text;
  const bars = waiting || performance.now() - started < 280;
  let edge = "";
  if (waiting) edge = "████████ ██████ ████";
  else {
    const tail = text.slice(-5);
    edge = bars ? tail.replace(/\S/g, "█") : tail.replace(/\S/g, () => GLYPHS.charAt((Math.random() * GLYPHS.length) | 0));
  }
  const body = waiting ? "" : text.slice(0, Math.max(0, text.length - 5));
  return (
    <div className="answer">
      <Rich text={body} trailing={<><span className="edge">{edge}</span><span className="caret" aria-hidden /></>} />
    </div>
  );
}

/* texto com parágrafos e blocos de código */
function Rich({ text, trailing }: { text: string; trailing?: React.ReactNode }) {
  const parts = text.split(/```/);
  return (
    <div className="rich">
      {parts.map((p, i) => {
        const last = i === parts.length - 1;
        if (i % 2 === 1) {
          const code = p.replace(/^[a-zA-Z0-9_-]*\n/, "");
          return <pre key={i}><code>{code}{last && trailing}</code></pre>;
        }
        const paras = p.split(/\n{2,}/).filter((x, j, arr) => x.trim() || (last && j === arr.length - 1));
        return paras.map((para, j) => (
          <p key={`${i}-${j}`}>{para}{last && j === paras.length - 1 && trailing}</p>
        ));
      })}
      {parts.length === 1 && !text && trailing && <p>{trailing}</p>}
    </div>
  );
}

/* ── popover que sobe da pílula (no celular vira folha de baixo) ── */
function Pop({ open, onClose, mobile, title, children, width = 340 }: {
  open: boolean; onClose: () => void; mobile: boolean; title: string; children: React.ReactNode; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-pill]")) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open) return null;
  if (mobile) {
    return (
      <>
        <div className="sheet-backdrop" onClick={onClose} aria-hidden />
        <div ref={ref} className="sheet" role="dialog" aria-label={title}>
          <div className="sheet-grip" aria-hidden />
          <div className="sheet-title">{title}</div>
          {children}
        </div>
      </>
    );
  }
  return <div ref={ref} className="pop" role="dialog" aria-label={title} style={{ width }}>{children}</div>;
}

type Row = { id: string; role: "user" | "assistant"; content: string; streaming?: boolean; started?: number; ms?: number; error?: boolean; model?: string };
type PopId = "agent" | "model" | "mode" | "opts" | null;

export function App() {
  const mobile = useMobile();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convId, setConvId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [routes, setRoutes] = useState<Routes | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [mode, setMode] = useState<Mode>((localStorage.getItem("heretic-mode") as Mode) || "chat");
  const [agent, setAgent] = useState<AgentId>((localStorage.getItem("heretic-agent") as AgentId) || "pesquisador");
  const [params, setParams] = useState<ChatParams>({ temperature: 1, top_p: 1, max_tokens: 4096 });
  const [streaming, setStreaming] = useState(false);
  const [sideOpen, setSideOpen] = useState(!window.matchMedia("(max-width: 820px)").matches);
  const [sessOpen, setSessOpen] = useState(false);
  const [pop, setPop] = useState<PopId>(null);
  const [agentQ, setAgentQ] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  // Onboarding desligado (dono, 15/11): o chat abre livre, sem escolher assunto/agente antes.
  const [onb, setOnb] = useState(false);
  const [onbDone, setOnbDone] = useState(false);
  const dict = useDictation(useCallback((t: string) => setDraft(t), []));
  const ctrlRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "dark");
  }, []);
  useEffect(() => { if (mobile) setSideOpen(false); }, [mobile]);

  const refreshConvs = useCallback(async () => { try { setConvs(await api.conversations(null)); } catch { /* sem conversas */ } }, []);
  const refreshHealth = useCallback(async () => { try { setHealth(await api.health()); } catch { /* opcional */ } }, []);

  useEffect(() => {
    (async () => {
      try {
        const [m, r] = await Promise.all([api.models(), api.routes()]);
        setModels(m); setRoutes(r);
      } catch { /* API fora */ }
      await Promise.all([refreshConvs(), refreshHealth()]);
    })();
    // pergunta vinda da landing: /app/?q=...
    const q = new URLSearchParams(location.search).get("q");
    const ag = new URLSearchParams(location.search).get("agent") as AgentId | null;
    if (ag && AGENTS.some((x) => x.id === ag)) { setAgent(ag); localStorage.setItem("heretic-agent", ag); }
    if (q || ag) { localStorage.setItem("heretic-onboarded", "1"); setOnb(false); }
    if (q) setDraft(q);
    if (q || ag) history.replaceState(null, "", location.pathname);
  }, [refreshConvs, refreshHealth]);

  const follow = useCallback(() => {
    const t = threadRef.current;
    if (t && t.scrollHeight - t.clientHeight - t.scrollTop < 160) t.scrollTo({ top: t.scrollHeight });
  }, []);
  useLayoutEffect(follow, [rows, follow]);

  const openConv = async (id: number) => {
    setConvId(id); if (mobile) setSideOpen(false);
    const msgs = await api.messages(id);
    setRows(msgs.filter((m) => m.role !== "system").map((m, i) => ({ id: `h${i}`, role: m.role as Row["role"], content: m.content })));
    requestAnimationFrame(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }));
  };
  const newChat = () => { ctrlRef.current?.abort(); setConvId(null); setRows([]); setStreaming(false); if (mobile) setSideOpen(false); inputRef.current?.focus(); };
  const removeConv = async (id: number) => { await api.deleteConversation(id); if (convId === id) newChat(); refreshConvs(); };

  const activeModel = routes?.[mode]?.model ?? "";
  const activeInfo = models.find((m) => m.id === activeModel);
  const route = health?.routes?.[mode];
  const agentInfo = AGENTS.find((a) => a.id === agent) ?? AGENTS[0]!;

  const changeModel = async (model: string) => {
    setPop(null);
    try { await api.setRoute(mode, model); setRoutes((p) => (p ? { ...p, [mode]: { model } } : p)); refreshHealth(); } catch { /* ignora */ }
  };
  const pickAgent = (id: AgentId) => { setAgent(id); localStorage.setItem("heretic-agent", id); setPop(null); setAgentQ(""); inputRef.current?.focus(); };
  const pickMode = (m: Mode) => { setMode(m); localStorage.setItem("heretic-mode", m); setPop(null); };
  const stop = () => { ctrlRef.current?.abort(); };

  const send = async (raw?: string) => {
    const value = (raw ?? draft).trim();
    if (!value || streaming) return;
    setDraft("");
    let cid = convId;
    if (!cid) {
      try { const c = await api.createConversation(null, value.slice(0, 48)); cid = c.id; setConvId(cid); refreshConvs(); }
      catch { cid = 0; }
    }
    const history: Msg[] = rows.filter((r) => !r.error).map((r) => ({ role: r.role, content: r.content }));
    history.push({ role: "user", content: value });
    const started = performance.now();
    const aiId = `a${Date.now()}`;
    setRows((r) => [...r, { id: `u${Date.now()}`, role: "user", content: value }, { id: aiId, role: "assistant", content: "", streaming: true, started, model: shortModel(activeInfo?.label) }]);
    setStreaming(true);
    ctrlRef.current = streamChat(
      { conversationId: cid ?? 0, mode, messages: history, params, agent },
      {
        onToken: (full) => setRows((r) => r.map((x) => (x.id === aiId ? { ...x, content: full } : x))),
        onError: (message) => {
          setRows((r) => r.map((x) => (x.id === aiId ? { ...x, content: message === "Daily limit reached" ? "You've hit today's message limit." : message, streaming: false, error: true } : x)));
          setStreaming(false);
        },
        onDone: (content) => {
          const ms = Math.round(performance.now() - started);
          setRows((r) => r.map((x) => (x.id === aiId ? { ...x, content: content || x.content, streaming: false, ms } : x)));
          setStreaming(false); refreshConvs(); refreshHealth();
        },
      },
    );
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); return; }
    if (e.key === "/" && !draft) { e.preventDefault(); setPop("agent"); }
  };

  const filtered = convs.filter((c) => !search || c.title?.toLowerCase().includes(search.toLowerCase()));
  const today = filtered.filter((c) => isToday(c.updated_at));
  const before = filtered.filter((c) => !isToday(c.updated_at));
  const title = convs.find((c) => c.id === convId)?.title || "New chat";
  const used = health?.daily_requests ?? 0;
  const limit = health?.daily_limit ?? 0;
  const ctxMax = route?.maxCtx ?? 0;
  const ctxUsed = useMemo(() => Math.round(rows.reduce((n, r) => n + r.content.length, 0) / 4), [rows]);
  const visibleAgents = AGENTS.filter((a) => !agentQ || (a.name + a.line).toLowerCase().includes(agentQ.toLowerCase()));
  const empty = rows.length === 0;
  const toggle = (p: Exclude<PopId, null>) => setPop((cur) => (cur === p ? null : p));

  const ConvItem = ({ c }: { c: Conversation }) => (
    <div className={`conv ${convId === c.id ? "on" : ""}`}>
      <button className="conv-open" onClick={() => openConv(c.id)}><span className="conv-dot" aria-hidden />{c.title}</button>
      <button className="conv-del" aria-label={`Delete ${c.title}`} onClick={() => removeConv(c.id)}>Delete</button>
    </div>
  );

  return (
    <div className={`app ${sideOpen ? "side-open" : ""} ${sessOpen ? "sess-open" : ""}`}>
      {mobile && sideOpen && <div className="sheet-backdrop" onClick={() => setSideOpen(false)} aria-hidden />}

      {/* esquerda */}
      <aside className="side" aria-label="Chats">
        <div className="side-in">
          <header className="side-head">
            <a className="brand" href="/" aria-label="Heretic, home"><img src="/icons/cicada.png" alt="" width={50} height={18} style={{ height: 18, width: "auto" }} /><span>Heretic</span></a>
          </header>
          <Button variant="secondary" size="md" className="full" onClick={newChat}>New chat</Button>
          <div className="side-search"><SearchField label="" aria-label="Search chats" placeholder="Search" value={search} onValueChange={setSearch} /></div>
          <nav className="side-list">
            {filtered.length === 0 && <p className="side-empty">No chats yet.</p>}
            {today.length > 0 && <div className="side-label">Today</div>}
            {today.map((c) => <ConvItem key={c.id} c={c} />)}
            {before.length > 0 && <div className="side-label">Earlier</div>}
            {before.map((c) => <ConvItem key={c.id} c={c} />)}
          </nav>
          <footer className="side-foot">
            <UserMenu
              user={{ name: "You", email: "Free plan" }}
              showTheme={false}
              align="start"
              items={[
                { label: "Session & usage", onSelect: () => setSessOpen(true) },
                { label: "Home", onSelect: () => { location.href = "/"; } },
              ]}
            />
          </footer>
        </div>
      </aside>

      {/* centro */}
      <main className="main">
        <div className="main-glow" aria-hidden />
        <header className="top">
          <Button variant="ghost" size="md" aria-label="Toggle chat list" onClick={() => setSideOpen((v) => !v)} className="icon-btn"><span className="burger" aria-hidden><i /><i /><i /></span></Button>
          {mobile ? (
            <button className="top-title-btn" aria-label="Chat session" onClick={() => setSessOpen(true)}>
              <span className="top-title">{empty ? "New chat" : title}</span>
              <span className="top-sub">Session · {fmtK(ctxUsed)} of {fmtK(ctxMax)}</span>
            </button>
          ) : <h1 className="top-title">{empty ? "New chat" : title}</h1>}
          {mobile
            ? <Button variant="ghost" size="sm" onClick={newChat}>New</Button>
            : <Button variant="ghost" size="sm" onClick={() => setSessOpen((v) => !v)}>{sessOpen ? "Close session" : "Session"}</Button>}
        </header>

        {empty ? (
          onb ? (
            <Onboarding mobile={mobile}
              onSkip={() => { localStorage.setItem("heretic-onboarded", "1"); setOnb(false); }}
              onPick={(id, question) => { setAgent(id); localStorage.setItem("heretic-agent", id); localStorage.setItem("heretic-onboarded", "1"); setDraft(question); setOnb(false); setOnbDone(true); requestAnimationFrame(() => inputRef.current?.focus()); }} />
          ) : (
          <section className="empty">
            <img className="empty-logo" src="/icons/cicada.png" alt="Heretic" width={mobile ? 150 : 190} />
            <h2>Ask anything.</h2>
            {onbDone && <p className="onb-done"><b>Step 3 of 3.</b> Your question is ready. Press Send.</p>}
          </section>
          )
        ) : (
          <section className="thread" ref={threadRef}>
            <div className="col">
              {rows.map((r) => r.role === "user" ? (
                <div key={r.id} className="u-row"><MessageBubble from="user" author="You" tail={false}>{r.content}</MessageBubble></div>
              ) : (
                <div key={r.id} className="a-row">
                  {r.error
                    ? <p className="err">{r.content}</p>
                    : <Answer text={r.content} streaming={!!r.streaming} started={r.started ?? 0} />}
                  {!r.streaming && !r.error && r.ms != null && (
                    <div className="stats">
                      <span>{(r.ms / 1000).toFixed(1)} s · {r.content.length} chars · {r.model}</span>
                      <button className="act" onClick={() => navigator.clipboard?.writeText(r.content)}>Copy</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {mobile && dict.on && (
          <div className="listening" aria-live="polite">
            <VoiceOrb state="listening" size={200} label="Listening" />
            <p className="listening-title">Listening…</p>
            <p className="listening-sub">{draft || "Release to send."}</p>
          </div>
        )}

        {/* compositor */}
        <div className="dock">
          <div className="dock-in">
            {empty && !onb && (
              <div className="chips">
                <ChipGroup label="Suggestions" multiple={false} value={[]} options={SUGGESTIONS}
                  onValueChange={(v) => { if (v[0]) send(v[0]); }} />
              </div>
            )}
            <div className="composer">
              <div className="row1">
                <textarea ref={inputRef} rows={mobile ? 1 : 2} aria-label="Message Heretic" placeholder={`Ask ${agentInfo.name}…`}
                  value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
                {mobile && dict.supported && !streaming && (
                  <button className="voice-hold" aria-label="Hold to talk, release to send"
                    onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); dict.start(); }}
                    onPointerUp={() => dict.stop((t) => { if (t.trim()) send(t); })}
                    onPointerCancel={() => dict.stop()} onContextMenu={(e) => e.preventDefault()}>Voice</button>
                )}
                {mobile && (streaming
                  ? <Button variant="secondary" size="sm" onClick={stop}>Stop</Button>
                  : <Button variant="primary" size="sm" onClick={() => send()} disabled={!draft.trim()}>Send</Button>)}
              </div>
              <div className="bar">
                <div className="pills">
                  <span className="pill-wrap">
                    <button data-pill className={`pill ${pop === "agent" ? "on" : ""}`} aria-expanded={pop === "agent"} aria-label="Agent" onClick={() => toggle("agent")}>
                      <Mascot kind={agentInfo.mascot} size={18} /><span>{agentInfo.name}</span><span className="chev" aria-hidden>⌄</span>
                    </button>
                    <Pop open={pop === "agent"} onClose={() => setPop(null)} mobile={mobile} title="Agent">
                      <div className="pop-search"><SearchField label="" aria-label="Search agents" placeholder="Search agents" value={agentQ} onValueChange={setAgentQ} autoFocus /></div>
                      <div className="pop-list" role="listbox" aria-label="Agents">
                        {visibleAgents.map((a) => (
                          <button key={a.id} role="option" aria-selected={a.id === agent} className="opt" onClick={() => pickAgent(a.id)}>
                            <span className="opt-ico"><Mascot kind={a.mascot} size={26} /></span>
                            <span className="opt-txt"><strong>{a.name}</strong><span>{a.line}</span></span>
                            <span className="opt-dot" aria-hidden />
                          </button>
                        ))}
                      </div>
                    </Pop>
                  </span>

                  <span className="pill-wrap">
                    <button data-pill className={`pill ${pop === "model" ? "on" : ""}`} aria-expanded={pop === "model"} aria-label="Model" onClick={() => toggle("model")}>
                      <span>{shortModel(activeInfo?.label) || "Model"}</span><span className="chev" aria-hidden>⌄</span>
                    </button>
                    <Pop open={pop === "model"} onClose={() => setPop(null)} mobile={mobile} title="Model">
                      <div className="pop-list" role="listbox" aria-label="Models">
                        {models.map((m) => (
                          <button key={m.id} role="option" aria-selected={m.id === activeModel} className="opt" onClick={() => changeModel(m.id)}>
                            <span className="opt-txt"><strong>{shortModel(m.label)}</strong><span>{m.price_in === 0 ? "free" : `$${m.price_in} / $${m.price_out} per 1M tokens`}</span></span>
                            <span className="opt-dot" aria-hidden />
                          </button>
                        ))}
                      </div>
                    </Pop>
                  </span>

                  <span className="pill-wrap">
                    <button data-pill className={`pill ${pop === "mode" ? "on" : ""}`} aria-expanded={pop === "mode"} aria-label="Mode" onClick={() => toggle("mode")}>
                      <span>{MODES.find((m) => m.value === mode)?.label}</span><span className="chev" aria-hidden>⌄</span>
                    </button>
                    <Pop open={pop === "mode"} onClose={() => setPop(null)} mobile={mobile} title="Mode" width={280}>
                      <div className="pop-list" role="listbox" aria-label="Modes">
                        {MODES.map((m) => (
                          <button key={m.value} role="option" aria-selected={m.value === mode} className="opt" onClick={() => pickMode(m.value)}>
                            <span className="opt-txt"><strong>{m.label}</strong><span>{m.line}</span></span>
                            <span className="opt-dot" aria-hidden />
                          </button>
                        ))}
                      </div>
                    </Pop>
                  </span>

                  <span className="pill-wrap">
                    <button data-pill className={`pill ${pop === "opts" ? "on" : ""}`} aria-expanded={pop === "opts"} aria-label="Options" onClick={() => toggle("opts")}>
                      <span>Options</span><span className="chev" aria-hidden>⌄</span>
                    </button>
                    <Pop open={pop === "opts"} onClose={() => setPop(null)} mobile={mobile} title="Options" width={300}>
                      <div className="opts">
                        <Slider label="Temperature" min={0} max={2} step={0.1} value={params.temperature}
                          onValueChange={(v) => setParams({ ...params, temperature: v as number })} format={(n) => n.toFixed(1)} />
                        <Slider label="Max response length" min={256} max={8192} step={256} value={params.max_tokens}
                          onValueChange={(v) => setParams({ ...params, max_tokens: v as number })} format={(n) => `${n} tokens`} />
                      </div>
                    </Pop>
                  </span>
                </div>
                {!mobile && (
                  <div className="send">
                    {dict.supported && !streaming && (dict.on
                      ? <button className="dict-on" aria-label="Stop dictation" title="Stop dictation" onClick={() => dict.stop()}><VoiceOrb state="listening" size={32} label="Listening" /></button>
                      : <Button variant="ghost" size="sm" onClick={() => dict.start()}>Dictate</Button>)}
                    {streaming
                      ? <Button variant="secondary" size="sm" onClick={stop}>Stop</Button>
                      : <Button variant="primary" size="sm" onClick={() => send()} disabled={!draft.trim()}>Send</Button>}
                  </div>
                )}
              </div>
            </div>
            {dict.error && <p className="hint">{dict.error}</p>}
            {!mobile && !dict.error && <p className="hint"><kbd>/</kbd>switch agent · Enter to send, Shift+Enter for a new line</p>}
          </div>
        </div>
      </main>

      {/* direita: sessão */}
      <aside className="sess" aria-label="Session" aria-hidden={!sessOpen}>
        <div className="sess-in">
          {mobile && <div className="sheet-title">Session</div>}
          <Progress label={`Context · ${fmtK(ctxUsed)} of ${fmtK(ctxMax)}`} value={ctxMax ? Math.min(100, (ctxUsed / ctxMax) * 100) : 0} />
          <Progress label={`Today · ${used} of ${limit || "∞"}`} value={limit ? Math.min(100, (used / limit) * 100) : 0} />
          <div className="sess-row"><span>Model</span><span>{shortModel(activeInfo?.label)}</span></div>
          <div className="sess-row"><span>Agent</span><span>{agentInfo.name}</span></div>
          {mobile && <Button variant="secondary" size="md" onClick={() => setSessOpen(false)}>Close</Button>}
        </div>
      </aside>
      {mobile && sessOpen && <div className="sheet-backdrop" onClick={() => setSessOpen(false)} aria-hidden />}
    </div>
  );
}
