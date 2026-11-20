// Um turno da conversa no desenho "Heretic - Chat Pro" (Claude Design, aprovado 17/11):
// pergunta em bolha + cabeçalho do modelo + raciocínio + busca/fontes + resposta + estatística + ações.
// Tudo com componentes Pro reais da ryan-ui. O ResponseFeedback é montado pelas próprias peças
// (classes do módulo dele + FeedbackActions) sem a moldura de cartão e sem o estilo de texto do
// corpo, que vazava para o Markdown, o raciocínio e os cartões de fonte — igual ao ajuste do desenho.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Download, FileDown, FileText, Image as ImageIcon, RotateCcw, PenLine } from "lucide-react";
import { FeedbackActions } from "@pro/response-feedback/response-feedback";
import type { FeedbackEvent, FeedbackRating } from "@pro/response-feedback/response-feedback";
export type { FeedbackEvent };
import rf from "@pro/response-feedback/response-feedback.module.css";
import { CopyButton } from "@pro/copy-button/copy-button";
import { Tooltip } from "@pro/tooltip/tooltip";
import { ReasoningBlock } from "@pro/reasoning-block/reasoning-block";
import { ToolCallGroup } from "@pro/tool-call/tool-call";
import type { ToolCallData } from "@pro/tool-call/tool-call";
import { SourceCards } from "@pro/source-cards/source-cards";
import type { SourceCardsSource, SourceMark } from "@pro/source-cards/source-cards";
import { CoverFlow } from "@pro/cover-flow/cover-flow";
import { GenerationStats } from "@pro/generation-stats/generation-stats";
import { ImageReveal } from "@pro/image-reveal/image-reveal";
import { Markdown } from "./markdown";
import { ArenaAnswers, arenaVotedNow } from "./arena";
import type { ArenaData } from "./arena";
import { t } from "./i18n";

export interface WebSource { url: string; title: string; snippet?: string }
/** Foto pública de uma pessoa (og:image do perfil dela), extraída pelo servidor numa pesquisa de pessoa. */
export interface PersonPhoto { src: string; source?: string; title?: string }
/** Dados extras guardados na própria mensagem (localStorage). */
export interface ReplyMeta {
  model?: string;
  image?: string;
  /** Envio, 1º token, fim do raciocínio e fim da resposta (ms desde a época). */
  t0?: number; tFirst?: number; tThink?: number; t2?: number;
  /** Velocidade (tokens/s) amostrada durante o streaming, para o gráfico da estatística. */
  samples?: number[];
  /** Tokens de entrada estimados (mesma conta do servidor: ~4 caracteres por token). */
  inTok?: number;
  search?: { query: string; status: "running" | "success"; t?: number; ms?: number };
  sources?: WebSource[];
  /** Fotos públicas da pessoa pesquisada (galeria acima da ficha). */
  photos?: PersonPhoto[];
  /** Etapas reais do trabalho do servidor (mostradas no bloco "Pensando"). */
  steps?: { title: string; text: string }[];
  rating?: FeedbackRating | null;
  reasons?: string[];
  /** Modo Qualidade: as duas respostas, a indicada pelo juiz e a escolhida pelo usuário. */
  arena?: ArenaData;
}
export interface TurnMessage extends ReplyMeta { id: string; role: "user" | "assistant"; text: string; state: "thinking" | "streaming" | "done" | "stopped"; enhanced?: boolean }

export const estTokens = (s: string) => Math.ceil((s || "").length / 4);

/** A resposta pede pra escolher ENTRE PESSOAS (card com 3+ opções)? Aí não mostra fotos — seriam de quem?
 *  A conferência "É esta pessoa?" (2 opções) não conta: ali a ficha e as fotos são de uma pessoa só. */
function pickingPerson(text: string): boolean {
  const re = /```\s*(?:ask|select|options?|choices?|escolha|op[çc][õo]es|pergunta)\b([\s\S]*?)(?:```|$)/gi;
  for (const m of text.matchAll(re)) {
    const opts = (m[1] ?? "").split("\n").filter(l => /^\s*[-*]\s+\S/.test(l)).length;
    if (opts >= 3) return true;
  }
  return false;
}

/** Raciocínio dentro de <think>…</think> (o servidor manda; antes ficava escondido). */
export function thinkOf(raw: string): { text: string; present: boolean; closed: boolean } {
  const s = raw || "";
  const open = s.search(/<think>/i);
  if (open === -1 || open > 24) return { text: "", present: false, closed: false };
  const rest = s.slice(open + 7);
  const end = rest.search(/<\/think>/i);
  return end === -1 ? { text: rest.trim(), present: true, closed: false } : { text: rest.slice(0, end).trim(), present: true, closed: true };
}

const MARKS: Array<[RegExp, SourceMark]> = [[/(^|\.)github\.com$/, "github"], [/(^|\.)wikipedia\.org$/, "wikipedia"], [/(^|\.)stackoverflow\.com$/, "stackoverflow"], [/^developer\.mozilla\.org$/, "mdn"], [/(^|\.)vercel\.com$/, "vercel"], [/(^|\.)stripe\.com$/, "stripe"]];
function toCard(s: WebSource): SourceCardsSource {
  let host = "";
  try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* url inválida */ }
  const mark = MARKS.find(([re]) => re.test(host))?.[1];
  return { url: s.url, title: s.title || host || s.url, site: host || undefined, snippet: s.snippet || undefined, ...(mark ? { mark } : {}) };
}

const POS = ["Resposta certa", "Fácil de entender", "Direto ao ponto", "Bom código"];
const NEG = ["Informação errada", "Incompleta", "Recusou sem motivo", "Fora do assunto"];

// Avatar da IA = mini cigarra da marca (proporção 24×14), no lugar da máscara antiga.
const Mask = ({ size = 16 }: { size?: number }) => <span className="mask" data-pro="" aria-hidden="true" style={{ width: Math.round(size * 1.25), height: Math.round(size * 0.75) }} />;

/** Botão de baixar (PDF ou .md) que já existia no app, agora como ação extra da barra do turno. */
function DownloadMenu({ onPdf, onMd, image }: { onPdf?: () => void; onMd?: () => void; image?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  if (image) return (
    <Tooltip content={t("Download")}>
      <button type="button" className={rf.iconButton} aria-label={t("Download image")} onClick={image}><Download size={16} strokeWidth={1.75} aria-hidden="true" /></button>
    </Tooltip>
  );
  return (
    <div className="hx-dl" ref={ref}>
      <Tooltip content={t("Download")}>
        <button type="button" className={rf.iconButton} aria-label={t("Download reply")} aria-expanded={open} onClick={() => setOpen(o => !o)}><Download size={16} strokeWidth={1.75} aria-hidden="true" /></button>
      </Tooltip>
      {open ? (
        <div className="hx-dlmenu" role="menu">
          <button type="button" role="menuitem" className="hx-dlitem" onClick={() => { setOpen(false); onPdf?.(); }}><FileText size={14} aria-hidden="true" />PDF</button>
          <button type="button" role="menuitem" className="hx-dlitem" onClick={() => { setOpen(false); onMd?.(); }}><FileDown size={14} aria-hidden="true" />Markdown (.md)</button>
        </div>
      ) : null}
    </div>
  );
}

export interface TurnProps {
  prompt?: string;
  enhanced?: boolean;
  reply?: TurnMessage;
  /** Texto visível da resposta (sem o raciocínio) e quanto já foi "digitado". */
  shown: string;
  caret: boolean;
  /** A resposta acabou de chegar nesta sessão (anima a imagem). */
  fresh?: boolean;
  canRegenerate: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onFeedback: (event: FeedbackEvent) => void;
  onPdf: (el: Element | null) => void;
  onMd: (text: string) => void;
  onImage: (src: string, name: string) => void;
  /** Clique num botão de um bloco ```ask (pergunta com opções) → vira a próxima mensagem. */
  onOption?: (value: string) => void;
  /** As fontes deste turno já aparecem na coluna/faixa "Fontes" (desenho App v2): não repete os cartões. */
  hideSources?: boolean;
  /** Modo Qualidade: nome do cartão de cada resposta e a troca pela outra. */
  arenaName?: (modelId: string, index: number) => string;
  onArenaPick?: (index: number) => void;
}

export function Turn({ prompt, enhanced, reply, shown, caret, fresh, canRegenerate, busy, onRegenerate, onFeedback, onPdf, onMd, onImage, onOption, hideSources, arenaName, onArenaPick }: TurnProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // "Pensando" aberto sozinho enquanto o modelo trabalha (mostra as etapas reais ao vivo) e fechado
  // quando a resposta começa. Se a pessoa abrir ou fechar na mão, vale a escolha dela.
  const [thinkOpen, setThinkOpen] = useState<boolean | null>(null);
  const isImage = !!reply && (reply.model === t("Image") || !!reply.image);
  const name = isImage ? "451.sh" : (reply?.model ? (/^(Heretic|451)\b/.test(reply.model) ? reply.model.replace(/^Heretic\b/, "451") : `451 ${reply.model}`) : "451.sh");
  const heretic = { name, mark: <Mask size={16} /> };
  const done = !!reply && (reply.state === "done" || reply.state === "stopped");

  let blocks: ReactNode = null;
  if (reply && isImage) {
    blocks = reply.image ? (
      <div className="hx-turn-img">
        {fresh
          ? <ImageReveal src={reply.image} alt={reply.text || t("Generated image")} autoPlay loop={false} queueDuration={0} duration={1400} decodeDuration={900} steps={30} aspectRatio={1} size="lg" sheen={false} showProgress={false} queueLabel={t("Queued")} errorMessage={t("Couldn't generate the image. Try again.")} />
          : <ImageReveal src={reply.image} alt={reply.text || t("Generated image")} status="done" autoPlay={false} loop={false} sheen={false} showProgress={false} aspectRatio={1} size="lg" />}
      </div>
    ) : reply.state === "thinking"
      ? <div className="hx-imgskeleton" role="img" aria-label={t("Generating image…")}><ImageIcon size={26} aria-hidden="true" /></div>
      : <Markdown text={reply.text} />;
  } else if (reply) {
    const th = thinkOf(reply.text);
    const waiting = reply.state === "thinking" || (reply.state === "streaming" && !shown && !th.present);
    const search = reply.search;
    const sources = (reply.sources ?? []).map(toCard);
    // Etapas reais que o servidor mandou (entendendo, buscando, lendo fontes…) + o raciocínio do modelo, se houver.
    const steps = reply.steps ?? [];
    const hasSteps = steps.length > 0;
    const reasoning = hasSteps
      ? [...steps, ...(th.text.trim() ? [{ title: "Raciocínio do modelo", text: th.text }] : [])]
      : th.text;
    // Com etapas: "pensando" até a resposta começar; depois fica recolhido ("Pensou por X s") pra poder abrir.
    const thinkStatus: "thinking" | "done" | "stopped" = th.present
      ? (th.closed ? "done" : reply.state === "stopped" ? "stopped" : "thinking")
      : waiting ? (reply.state === "stopped" ? "stopped" : "thinking") : "done";
    const thinkEnd = th.closed ? reply.tThink : reply.tFirst;
    const seconds = thinkStatus === "done" && thinkEnd && reply.t0 ? Math.max(1, Math.round((thinkEnd - reply.t0) / 1000)) : undefined;
    const call: ToolCallData | null = search ? {
      id: "busca", tool: "web", title: t("Search the web"),
      status: search.status === "running" ? "running" : "success",
      input: { [t("query")]: search.query },
      summary: sources.length ? `${sources.length} ${t("sources found")}` : t("Search done"),
      ...(typeof search.ms === "number" ? { durationMs: search.ms } : {}),
    } : null;
    const outTok = estTokens(reply.text);
    const ttft = reply.tFirst && reply.t0 ? reply.tFirst - reply.t0 : undefined;
    const genMs = reply.t2 && reply.tFirst ? Math.max(300, reply.t2 - reply.tFirst) : undefined;
    const stats = reply.state === "done" && reply.t0 && reply.t2 && shown && !reply.text.startsWith(t("Something went wrong: "));
    blocks = (
      <>
        {th.present || waiting || hasSteps ? (
          <ReasoningBlock
            reasoning={reasoning}
            status={thinkStatus}
            seconds={seconds}
            model={heretic}
            variant="plain"
            open={thinkOpen ?? (thinkStatus === "thinking" && hasSteps)}
            onOpenChange={setThinkOpen}
          />
        ) : null}
        {call ? <ToolCallGroup calls={[call]} active={search?.status === "running"} /> : null}
        {reply.photos && reply.photos.length && !pickingPerson(reply.text) ? (
          <div className="hx-photos">
            <CoverFlow
              label={t("Photos")}
              items={reply.photos.map((p, i) => ({ id: `${i}-${p.src}`, title: p.title || "", subtitle: p.source, image: p.src, imagePosition: "50% 25%", alt: p.title || "" }))}
            />
          </div>
        ) : null}
        {reply.arena && reply.state === "done" && reply.arena.answers.length === 2 && (reply.arena.chosen === undefined || arenaVotedNow(reply.id))
          ? <ArenaAnswers messageId={reply.id} question={prompt ?? ""} arena={reply.arena} name={arenaName ?? ((_, i) => `Resposta ${i + 1}`)} onPick={onArenaPick} />
          : shown ? <Markdown text={shown} caret={caret} onOption={onOption} /> : null}
        {sources.length && !hideSources ? <SourceCards sources={sources} status="done" total={sources.length} query={search?.query} hideStatus label={t("Sources")} /> : null}
        {stats ? (
          <div className="hx-genstats"><GenerationStats
            variant="inline"
            status="done"
            usage={{ inputTokens: reply.inTok, outputTokens: outTok, ttftMs: ttft, durationMs: reply.t2! - reply.t0!, tokensPerSecond: genMs ? Math.round((outTok / (genMs / 1000)) * 10) / 10 : undefined }}
            speedSamples={reply.samples && reply.samples.length > 1 ? reply.samples : undefined}
          /></div>
        ) : null}
      </>
    );
  }

  const copyText = isImage ? (reply?.text ?? "") : shown;
  const leading = (
    <>
      {copyText ? <CopyButton value={copyText} label={t("Copy reply")} iconOnly variant="plain" className={rf.copy} /> : null}
      {canRegenerate ? (
        <Tooltip content={t("Regenerate")}>
          <button type="button" className={rf.iconButton} aria-label={t("Regenerate reply")} onClick={onRegenerate} disabled={busy}>
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </Tooltip>
      ) : null}
    </>
  );
  const trailing = isImage
    ? (reply?.image ? <DownloadMenu image={() => onImage(reply.image!, reply.text || "heretic")} /> : null)
    : <DownloadMenu onPdf={() => onPdf(bodyRef.current)} onMd={() => onMd(shown)} />;

  return (
    <div className="hx-turn">
      {prompt !== undefined ? (
        <div className={rf.prompt}>
          <p className={rf.bubble} data-enhanced={enhanced ? "1" : undefined} key={enhanced ? "e" : "o"}><span className="hx-sr">{t("You: ")}</span>{prompt}</p>
          {enhanced ? <span className="hx-enhanced-tag"><PenLine size={11} aria-hidden="true" />{t("Refined by the agent")}</span> : null}
        </div>
      ) : null}
      {reply ? (
        <div className={`${rf.reply} hx-reply`}>
          <div className={rf.author}>
            <span className={rf.mark} aria-hidden="true"><Mask size={16} /></span>
            <span className={rf.modelName}>{name}</span>
          </div>
          <div className="hx-turn-body" ref={bodyRef}>
            <span className="hx-sr">451.sh: </span>
            {blocks}
            {reply.state === "stopped" ? <p className="hx-stopped">{shown || reply.image ? t("Stopped.") : t("Stopped before the reply started.")}</p> : null}
          </div>
          {done && (copyText || reply.image) ? (
            <FeedbackActions
              messageId={reply.id}
              defaultRating={reply.rating ?? null}
              onFeedback={onFeedback}
              positiveReasons={POS}
              negativeReasons={NEG}
              commentPlaceholder={t("Tell us what happened (optional)")}
              privacyNote={t("Your rating stays on this device. We only count good or bad, never the text.")}
              thanksMessage={t("Thanks for the rating")}
              leading={leading}
              trailing={trailing}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
