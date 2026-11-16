// Heretic chat: the ryan-ui "chat-app" block, wired to the real /api/chat stream.
// Same layout, motion and parts as the block (StreamingResponse, ThinkingShimmer, copy/regenerate),
// with Heretic's marks instead of the block's sparkle icon, conversations kept in localStorage,
// and the reply driven by the server instead of canned text. The prompt box is the forked
// ryan-ui Pro composer (./composer), with the model menu and the daily-token meter.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { Check, Copy, PanelLeft, RefreshCw, SquarePen } from "lucide-react";
import { motionTokens } from "@/lib/motion-tokens";
import { useCopyFeedback } from "@/lib/use-copy-feedback";
import { ThinkingShimmer } from "@/registry/components/loading-states/loading-states";
import type { ChatConversation, ChatMessage, ChatSuggestion } from "@/registry/blocks/chat-app/chat-app-data";
import styles from "@/registry/blocks/chat-app/chat-app.module.css";
import { api, streamChat } from "./api";
import { Markdown } from "./markdown";
import type { Msg, Usage } from "./api";
import { Composer, withAttachments } from "./composer/ai-composer";
import type { ComposerHandle, ModelOption } from "./composer/ai-composer";
import { OUT_OF_TOKENS, UsageLine } from "./composer/usage-line";
import { t, lang, setLang } from "./i18n";

function LangSwitch() {
  return (
    <span className="hx-lang" role="group" aria-label="Language / Idioma">
      {(["en", "pt"] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
    </span>
  );
}

const STORE = "heretic-chats-v2";
const standard = [...motionTokens.ease.standard] as [number, number, number, number];
const COMPACT_BELOW = 760;
const MAX_PROMPT_CHARS = 16000;
const MODEL_KEY = "heretic-model";
/** Used until GET /api/me answers (or if it fails). */
const FALLBACK_MODELS: ModelOption[] = [
  { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition", name: "Dolphin 24B", short: "Dolphin 24B", note: "Uncensored. Fast. 128k context", tier: "free", locked: false, provider: "openrouter", cost100: 0.033 },
  { id: "venice:venice-uncensored-1-2", name: "Venice Uncensored 1.2", short: "Venice UC", note: "Uncensored, vision and tools. 128k context", tier: "free", locked: false, provider: "venice", cost100: 0.033 },
];
const titleFrom = (prompt: string) => { const line = prompt.replace(/\s+/g, " ").trim(); return line.length > 44 ? `${line.slice(0, 43).trimEnd()}…` : line; };
const SUGGESTIONS: ChatSuggestion[] = [
  { title: t("Pentest my site"), prompt: t("Pentest example.com: open ports, headers, weak ciphers. Rank what you would exploit first.") },
  { title: t("Stop my DDoS"), prompt: t("Someone is DDoSing my API endpoint. What do I fix in the next ten minutes?") },
  { title: t("Find the intruder"), prompt: t("They were inside my server overnight. How do I find out how they got in?") },
  { title: t("SQL injection"), prompt: t("Show me the SQL injection in a classic login form, the query that proves it, and the patch.") },
];

const Mask = ({ size = 16 }: { size?: number }) => <span className="mask" aria-hidden style={{ width: size, height: Math.round(size * 1.2) }} />;
const Cicada = ({ width }: { width: number }) => <img src="/icons/cicada.png" alt="" width={width} style={{ display: "block", height: "auto", filter: "grayscale(1) brightness(1.4)" }} />;

function load(): ChatConversation[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || "[]") as ChatConversation[];
    if (Array.isArray(list) && list.length) return list.map(c => ({ ...c, messages: c.messages.map(m => (m.state === "thinking" || m.state === "streaming" ? { ...m, state: "stopped" } : m)) }));
  } catch { /* fresh start */ }
  return [{ id: `chat-${Date.now()}`, title: t("New chat"), updated: t("Now"), messages: [] }];
}

function AssistantActions({ text, canRegenerate, onRegenerate }: { text: string; canRegenerate: boolean; onRegenerate: () => void }) {
  const reduceMotion = useReducedMotion() ?? false;
  const { state, copy } = useCopyFeedback();
  const copied = state === "copied";
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
  const active = conversations.find(c => c.id === activeId) ?? conversations[0];
  const busy = generating !== null;
  const model = models.find(m => m.id === modelId && !m.locked) ?? models.find(m => !m.locked) ?? models[0]!;
  const outOfTokens = usage !== null && usage.remaining <= 0;
  const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(conversations.slice(0, 60))); } catch { /* full */ } }, [conversations]);
  useEffect(() => () => { ctrl.current?.abort(); window.clearTimeout(doneTimer.current); }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("q");
    if (q) { history.replaceState(null, "", location.pathname); composerRef.current?.fill(q); composerRef.current?.focus(); }
  }, []);
  // Plan, models (Pro ones arrive locked) and today's token usage.
  const loadMe = useCallback(() => {
    api.me().then(me => {
      if (Array.isArray(me.models) && me.models.length) setModels(me.models.map(m => ({ ...m, badge: m.tier === "pro" ? "Pro" : undefined })));
      if (me.plan) setPlan(me.plan);
      if (typeof me.limit === "number" && typeof me.used === "number") setUsage({ used: me.used, limit: me.limit, remaining: typeof me.remaining === "number" ? me.remaining : Math.max(0, me.limit - me.used) });
    }).catch(() => { /* keep the fallback model; the meter stays hidden */ });
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);
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
  useEffect(() => { pinned.current = true; toBottom(true); }, [active?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const observer = new ResizeObserver(() => { if (pinned.current) toBottom(false); });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchMessage = (conversationId: string, messageId: string, patch: (m: ChatMessage) => ChatMessage) => {
    setConversations(list => list.map(c => c.id !== conversationId ? c : { ...c, messages: c.messages.map(m => m.id === messageId ? patch(m) : m) }));
  };
  const finish = (how: "done" | "stopped") => {
    if (!generating) return;
    window.clearTimeout(doneTimer.current);
    ctrl.current?.abort(); ctrl.current = null;
    patchMessage(generating.conversationId, generating.messageId, m => how === "done" ? { ...m, state: "done" } : { ...m, state: "stopped", text: m.state === "thinking" ? "" : m.text });
    setGenerating(null);
  };
  // Streams one reply from the server into the given assistant message.
  const run = (conversationId: string, messageId: string, history: Msg[]) => {
    serverDone.current.delete(messageId);
    setGenerating({ conversationId, messageId });
    ctrl.current = streamChat(
      { conversationId: 0, mode: "chat", model: model.id, messages: history, params: { temperature: 1, top_p: 1, max_tokens: 4096 } },
      {
        onUsage: setUsage,
        onToken: full => patchMessage(conversationId, messageId, m => ({ ...m, text: full, state: m.state === "thinking" ? "streaming" : m.state })),
        onError: (message, info) => {
          window.clearTimeout(doneTimer.current);
          // Refusals before streaming (429 out of tokens, 403 Pro model) already carry a readable message.
          const text = info ? message : message === "Daily limit reached" ? t("You've hit today's message limit.") : `${t("Something went wrong: ")}${message}`;
          patchMessage(conversationId, messageId, m => ({ ...m, state: "done", text }));
          setGenerating(null); ctrl.current = null;
          if (info?.status === 403) loadMe();
        },
        onDone: content => {
          serverDone.current.add(messageId);
          window.clearTimeout(doneTimer.current);
          patchMessage(conversationId, messageId, m => ({ ...m, text: content || m.text, state: "done" }));
          setGenerating(g => (g && g.messageId === messageId ? null : g)); ctrl.current = null;
        },
      },
    );
  };
  const historyOf = (messages: ChatMessage[]): Msg[] => messages.filter(m => m.text && m.state !== "thinking").map(m => ({ role: m.role, content: m.text }));

  const send = (text: string, title?: string) => {
    const prompt = text.trim();
    if (!prompt || busy || !active || outOfTokens) return;
    const userMsg: ChatMessage = { id: nextId("prompt"), role: "user", text: prompt, state: "done" };
    const replyId = nextId("reply");
    const before = active.messages;
    setConversations(list => list.map(c => c.id !== active.id ? c : { ...c, title: c.messages.length === 0 ? titleFrom(title || prompt) : c.title, updated: "Now", messages: [...c.messages, userMsg, { id: replyId, role: "assistant", text: "", state: "thinking", model: model.short } as ChatMessage] }));
    run(active.id, replyId, historyOf([...before, userMsg]));
  };
  const regenerate = () => {
    if (busy || !active || outOfTokens) return;
    const last = active.messages[active.messages.length - 1];
    if (!last || last.role !== "assistant") return;
    patchMessage(active.id, last.id, m => ({ ...m, text: "", state: "thinking" }));
    run(active.id, last.id, historyOf(active.messages.slice(0, -1)));
  };
  const select = (id: string) => { if (id !== activeId) finish("done"); setActiveId(id); setDrawer(false); };
  const newChat = () => {
    finish("done");
    const empty = conversations.find(c => c.messages.length === 0);
    if (empty) setActiveId(empty.id);
    else { const id = nextId("chat"); setConversations(list => [{ id, title: t("New chat"), updated: t("Now"), messages: [] }, ...list]); setActiveId(id); }
    setDrawer(false);
    composerRef.current?.focus();
  };

  const spring: Transition = reduceMotion ? { duration: 0 } : motionTokens.spring.smooth;
  const pop: Transition = reduceMotion ? { duration: 0 } : motionTokens.spring.gentle;
  const lastMessage = active?.messages[active.messages.length - 1];

  return (
    <div ref={rootRef} className={`${styles.root} hx-chat`} data-compact={compact} data-drawer={drawer} onKeyDown={event => { if (event.key === "Escape" && drawer) { event.stopPropagation(); setDrawer(false); } }}>
      <AnimatePresence>
        {compact && drawer ? <motion.div key="scrim" className={styles.scrim} onClick={() => setDrawer(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : motionTokens.duration.standard, ease: standard }} /> : null}
      </AnimatePresence>
      <motion.nav className={styles.sidebar} aria-label={t("Conversations")} inert={compact && !drawer} initial={false} animate={{ x: compact && !drawer ? "-100%" : "0%" }} transition={spring}>
        <div className={styles.sidebarTop}>
          <a className={`${styles.brand} hx-brand`} href="/" aria-label="Heretic, home"><Cicada width={34} />Heretic</a>
          <button ref={newChatRef} type="button" className={styles.iconButton} onClick={newChat} aria-label={t("New chat")} title={t("New chat")}><SquarePen size={16} aria-hidden="true" /></button>
        </div>
        <LayoutGroup>
          <ul className={styles.conversations}>
            <AnimatePresence initial={false}>
              {conversations.map(c => {
                const current = c.id === active?.id;
                const preview = c.messages[c.messages.length - 1]?.text.replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim() ?? t("No messages yet");
                return (
                  <motion.li key={c.id} className={styles.conversationItem} layout={reduceMotion ? false : "position"} initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={pop}>
                    {current ? <motion.span layoutId={`${scope}-active`} className={styles.activeMark} transition={reduceMotion ? { duration: 0 } : motionTokens.spring.morph} /> : null}
                    <button type="button" className={styles.conversation} onClick={() => select(c.id)} aria-current={current ? "true" : undefined}>
                      <span className={styles.conversationTop}><span className={styles.conversationTitle}>{c.title}</span><span className={styles.conversationTime}>{c.updated}</span></span>
                      <span className={styles.conversationPreview}>{preview || t("Stopped")}</span>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </LayoutGroup>
        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden="true"><Mask size={16} /></span>
          <span className={styles.userText}><span className={styles.userName}>{t("Anonymous")}</span><span className={styles.userDetail}>{t("Free · no account")}</span></span>
          <LangSwitch />
        </div>
      </motion.nav>

      <section className={styles.main} aria-label={active ? active.title : "Chat"} inert={compact && drawer}>
        <header className={styles.header}>
          {compact ? <button ref={menuRef} type="button" className={styles.iconButton} onClick={() => setDrawer(true)} aria-label={t("Show conversations")} aria-expanded={drawer}><PanelLeft size={16} aria-hidden="true" /></button> : null}
          <h2 className={styles.title}>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span key={active?.title ?? "none"} className={styles.titleText} initial={reduceMotion ? false : { opacity: 0, y: 6, filter: `blur(${motionTokens.blur.soft}px)` }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, transition: { duration: 0 } }} transition={reduceMotion ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: standard }}>{active?.title ?? "Chat"}</motion.span>
            </AnimatePresence>
          </h2>
          <span className={styles.model}><span className={styles.modelDot} aria-hidden="true" />{model.short} · {t("Uncensored")}</span>
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
                        <div className="hx-ai-head" aria-hidden="true"><Mask size={18} /><span className="hx-ai-name">Heretic</span>{(message as ChatMessage & { model?: string }).model ? <span className="hx-ai-model">{(message as ChatMessage & { model?: string }).model}</span> : null}</div>
                        <div className="hx-ai-body">
                          <span className={styles.srOnly}>Heretic: </span>
                          {message.state === "thinking" ? <ThinkingShimmer className={styles.thinking} /> : message.text ? <Markdown text={message.text} caret={message.state === "streaming"} /> : null}
                          {message.state === "stopped" ? <p className={styles.stopped}>{message.text ? t("Stopped.") : t("Stopped before the reply started.")}</p> : null}
                          {message.state === "done" || message.state === "stopped" ? <AssistantActions text={message.text} canRegenerate={message.id === lastMessage?.id && !busy} onRegenerate={regenerate} /> : null}
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
          {usage ? <UsageLine plan={plan} {...usage} /> : <p className={styles.hint}>{t("Uncensored. Enter sends, Shift+Enter adds a line.")}</p>}
        </footer>
        <span className={styles.srOnly} role="status">{busy ? t("Heretic is replying") : ""}</span>
      </section>
    </div>
  );
}
