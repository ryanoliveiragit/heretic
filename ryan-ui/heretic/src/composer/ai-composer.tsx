"use client";

/**
 * Heretic composer: a fork of the `Composer` inside the ryan-ui Pro "ai-composer" block
 * (ryan-ui-work/rebrand/site-impl/src/components/ryan/ai-composer). Same surface, mirror,
 * `/` command listbox, attachment chips, model chip and send/stop button with its ring.
 *
 * Changed for Heretic (the backend can only take plain text):
 * - `@` mentions and the sample docs are gone; `/` commands stay in the sent text.
 * - Attachments are real, text-like files only (≤ 200 KB), read in the browser; see `withAttachments`.
 * - Web search, extended thinking and the effort picker are removed; models can be `locked` (Pro).
 * - Brand marks are replaced by the silver `.mask`; dictation uses the Web Speech API when present.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ClipboardPaste,
  Code,
  FileSpreadsheet,
  FileText,
  Languages,
  Lightbulb,
  Lock,
  Mic,
  Plus,
  TriangleAlert,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { TextShimmer } from "@pro/text-shimmer/text-shimmer";
import { Tooltip } from "@pro/tooltip/tooltip";
import { motionTokens } from "@pro/lib/motion-tokens";
import styles from "./ai-composer.module.css";
import { t, lang } from "../i18n";

const { spring, duration, ease } = motionTokens;
/** The block's shared settle: 240ms, no overshoot. */
const settle = { type: "spring", visualDuration: 0.24, bounce: 0 } as const;

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

/** Kept for API compatibility with the source block; Heretic's backend has no effort control. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelOption {
  id: string;
  name: string;
  short: string;
  note: string;
  tier?: "free" | "pro";
  /** Which upstream serves the model ("openrouter" | "venice"). */
  provider?: string;
  /** Estimated cost of ~100 messages, in USD. */
  cost100?: number | null;
  /** Listed but not selectable (Pro models on the free plan). */
  locked?: boolean;
  /** Small pill after the name; locked models show "Pro" when this is empty. */
  badge?: string;
  defaultEffort?: Effort;
}

interface CommandOption {
  id: string;
  label: string;
  hint: string;
}

const COMMANDS: CommandOption[] = [
  { id: "summarize", label: "/summarize", hint: t("Condense text or a file into key points") },
  { id: "translate", label: "/translate", hint: t("Translate into the language you name") },
  { id: "explain", label: "/explain", hint: t("Walk through code or an idea step by step") },
  { id: "fix", label: "/fix", hint: t("Find and fix the bug in the code") },
];

const COMMAND_ICONS: Record<string, LucideIcon> = {
  summarize: FileText,
  translate: Languages,
  explain: Lightbulb,
  fix: Wrench,
};

const ALL_TOKENS = COMMANDS.map((command) => command.label);

/* ---------- attachments: text-like files only ---------- */

const MAX_FILE_BYTES = 200 * 1024;
const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "rb", "java", "kt", "swift", "c", "h", "cc",
  "cpp", "hpp", "cs", "php", "lua", "r", "dart", "scala", "sh", "bash", "zsh", "ps1", "sql", "css", "scss",
  "less", "html", "htm", "vue", "svelte", "json", "jsonl", "xml", "yml", "yaml", "toml", "ini", "cfg",
  "conf", "env",
]);
const SHEET_EXTENSIONS = new Set(["csv", "tsv"]);
const PLAIN_EXTENSIONS = new Set(["txt", "md", "markdown", "mdx", "log", "rst", "tex", "srt", "vtt"]);
const ACCEPT = [...PLAIN_EXTENSIONS, ...SHEET_EXTENSIONS, ...CODE_EXTENSIONS].map((ext) => `.${ext}`).join(",");

type AttachmentKind = "code" | "sheet" | "text";

const ATTACHMENT_ICONS: Record<AttachmentKind, LucideIcon> = {
  code: Code,
  sheet: FileSpreadsheet,
  text: FileText,
};

type AttachmentStatus = "uploading" | "done" | "ready" | "error";

export interface Attachment {
  id: string;
  source: "file" | "paste";
  kind: AttachmentKind;
  name: string;
  size: number;
  meta: string;
  status: AttachmentStatus;
  progress: number;
  error?: string;
  /** File contents, once read. */
  text?: string;
}

export interface SubmitPayload {
  text: string;
  tokens: string[];
  attachments: Attachment[];
}

/** The prompt the model receives: the typed text, then each attachment as `--- file: NAME ---`. */
export function withAttachments({ text, attachments }: SubmitPayload): string {
  const files = attachments
    .filter((item) => item.text !== undefined && item.status !== "error")
    .map((item) => `\n\n--- file: ${item.name} ---\n${item.text}`)
    .join("");
  return `${text}${files}`.trim();
}

const extensionOf = (name: string) => (name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "");

function isTextFile(file: File) {
  const extension = extensionOf(file.name);
  if (PLAIN_EXTENSIONS.has(extension) || SHEET_EXTENSIONS.has(extension) || CODE_EXTENSIONS.has(extension)) return true;
  return !extension && (file.type.startsWith("text/") || file.type === "application/json");
}

function fileKind(name: string): AttachmentKind {
  const extension = extensionOf(name);
  if (SHEET_EXTENSIONS.has(extension)) return "sheet";
  if (CODE_EXTENSIONS.has(extension)) return "code";
  return "text";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

let attachmentSeq = 0;
const nextAttachmentId = () => `att-${Date.now().toString(36)}-${(attachmentSeq += 1)}`;

/* ---------- Web Speech API (Chrome, Edge, Safari); the mic hides where it is missing ---------- */

interface SpeechAlternativeLike {
  transcript: string;
}
interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternativeLike | undefined;
}
interface SpeechResultEventLike {
  results: { readonly length: number; [index: number]: SpeechResultLike | undefined };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/* ---------- parts ---------- */

/** Tokens the mirror paints as marks: `/command`, on a word boundary at both ends. */
interface TokenRange {
  start: number;
  end: number;
  text: string;
}

function findTokens(text: string, tokens: string[]): TokenRange[] {
  const ranges: TokenRange[] = [];
  for (const token of [...new Set(tokens)].sort((a, b) => b.length - a.length)) {
    let from = 0;
    for (;;) {
      const index = text.indexOf(token, from);
      if (index < 0) break;
      const end = index + token.length;
      const startsClean = index === 0 || /\s/.test(text[index - 1] ?? "");
      const endsClean = end === text.length || /[\s.,;:!?)]/.test(text[end] ?? "");
      if (startsClean && endsClean && !ranges.some((range) => index < range.end && end > range.start)) {
        ranges.push({ start: index, end, text: token });
      }
      from = end;
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

interface Trigger {
  start: number;
  query: string;
}

/** The `/` the caret is inside, if any. Commands only open at the start of a line. */
function detectTrigger(text: string, caret: number, ranges: TokenRange[]): Trigger | null {
  if (ranges.some((range) => caret > range.start && caret <= range.end)) return null;
  let index = caret - 1;
  while (index >= 0 && !/\s/.test(text[index] ?? "") && text[index] !== "/") index -= 1;
  if (index < 0 || text[index] !== "/") return null;
  const before = index === 0 ? "" : (text[index - 1] ?? "");
  if (before && before !== "\n") return null;
  const query = text.slice(index + 1, caret);
  if (query.length > 24) return null;
  return { start: index, query };
}

function ModelMask({ size = 14 }: { size?: number }) {
  return (
    <span
      className={cx("mask", styles.modelMask)}
      aria-hidden="true"
      style={{ width: size, height: Math.round(size * 1.2) }}
    />
  );
}

function AttachmentGlyph({ item }: { item: Attachment }) {
  if (item.source === "paste") return <ClipboardPaste className={styles.glyph} />;
  const Glyph = ATTACHMENT_ICONS[item.kind];
  return <Glyph className={styles.glyph} />;
}

/** Read progress as a hairline ring; the chip swaps it for a tick when the file lands. */
function UploadRing({ progress }: { progress: number }) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" className={styles.ring}>
      <circle className={styles.ringTrack} cx="9" cy="9" r="7" />
      <circle
        className={styles.ringFill}
        cx="9"
        cy="9"
        r="7"
        pathLength={1}
        strokeDasharray="1 1"
        style={{ strokeDashoffset: 1 - progress }}
      />
    </svg>
  );
}

interface AttachmentChipProps {
  item: Attachment;
  reduced: boolean;
  onRemove: (id: string) => void;
}

function AttachmentChip({ item, reduced, onRemove }: AttachmentChipProps) {
  const uploading = item.status === "uploading";
  return (
    <motion.li
      className={styles.chip}
      data-status={item.status}
      title={item.name}
      layout={reduced ? false : "position"}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: duration.fast, ease: [...ease.standard] } }}
    >
      <span className={styles.chipGlyph}>
        <AttachmentGlyph item={item} />
      </span>
      <span className={styles.chipText}>
        <span className={styles.chipName}>{item.name}</span>
        <span className={styles.chipMeta} aria-live="off">
          {item.status === "error" ? (
            <>
              <TriangleAlert className={styles.chipMetaIcon} aria-hidden="true" />
              {item.error}
            </>
          ) : uploading ? (
            <span className={styles.tabular}>Reading {Math.round(item.progress * 100)}%</span>
          ) : (
            item.meta
          )}
        </span>
      </span>
      <button
        type="button"
        className={styles.chipAction}
        aria-label={uploading ? `Cancel ${item.name}` : `Remove ${item.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove(item.id);
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {uploading ? (
            <motion.span
              key="ring"
              className={styles.chipActionGlyph}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <UploadRing progress={item.progress} />
            </motion.span>
          ) : item.status === "done" ? (
            <motion.span
              key="check"
              className={styles.chipActionGlyph}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <Check className={styles.chipCheck} aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="remove"
              className={styles.chipActionGlyph}
              initial={{ opacity: 0, rotate: -45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0 }}
            >
              <X aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </motion.li>
  );
}

interface WidthMorphProps {
  children: ReactNode;
  reduced: boolean;
  className?: string;
}

/** Springs to the width of new content instead of snapping, so the model chip never jumps. */
function WidthMorph({ children, reduced, className }: WidthMorphProps) {
  const inner = useRef<HTMLSpanElement>(null);
  const measured = useRef<string | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [animateWidth, setAnimateWidth] = useState(false);
  useLayoutEffect(() => {
    const node = inner.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const current = node.textContent;
      setAnimateWidth(measured.current !== null && measured.current !== current);
      measured.current = current;
      setWidth(Math.ceil(box?.inlineSize ?? node.offsetWidth));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <motion.span
      className={cx(styles.morph, className)}
      initial={false}
      animate={width === null ? undefined : { width }}
      transition={animateWidth && !reduced ? settle : { duration: 0 }}
    >
      <span ref={inner} className={styles.morphInner}>
        {children}
      </span>
    </motion.span>
  );
}

interface SendButtonProps {
  state: "empty" | "ready" | "blocked" | "generating";
  progress: number | null;
  progressSeconds: number;
  run: number;
  label: string;
  reduced: boolean;
  onSend: () => void;
  onStop: () => void;
}

/** Send, or stop while a reply is running: the ring around it carries that reply's progress. */
function SendButton({ state, progress, progressSeconds, run, label, reduced, onSend, onStop }: SendButtonProps) {
  const generating = state === "generating";
  const enabled = state === "ready" || generating;
  const tracked = progress !== null;
  const dash = tracked ? 1 - Math.max(0.02, progress) : 0.72;
  return (
    <Tooltip content={label}>
      <motion.button
        type="button"
        className={styles.send}
        data-state={state}
        aria-label={label}
        aria-disabled={!enabled || undefined}
        whileTap={enabled && !reduced ? { scale: 0.92 } : undefined}
        transition={spring.snappy}
        onClick={() => (generating ? onStop() : onSend())}
      >
        <svg
          className={styles.sendRing}
          viewBox="0 0 44 44"
          aria-hidden="true"
          data-spin={generating && !tracked && !reduced ? "" : undefined}
        >
          <motion.circle
            className={styles.sendTrack}
            cx="22"
            cy="22"
            r="20.5"
            animate={{ opacity: generating ? 1 : 0 }}
          />
          <motion.circle
            key={run}
            className={styles.sendArc}
            cx="22"
            cy="22"
            r="20.5"
            pathLength={1}
            strokeDasharray="1 1"
            initial={{ strokeDashoffset: 1, opacity: 0 }}
            animate={{ strokeDashoffset: dash, opacity: generating ? 1 : 0 }}
            transition={{
              strokeDashoffset: { duration: Math.max(0.12, progressSeconds), ease: "linear" },
              opacity: { duration: duration.standard, delay: generating || reduced ? 0 : 0.12 },
            }}
          />
        </svg>
        <AnimatePresence mode="popLayout" initial={false}>
          {generating ? (
            <motion.span
              key="stop"
              className={styles.sendGlyph}
              initial={{ opacity: 0, scale: 0.3, borderRadius: 8 }}
              animate={{ opacity: 1, scale: 1, borderRadius: 3 }}
            >
              <span className={styles.stopGlyph} />
            </motion.span>
          ) : (
            <motion.span
              key="arrow"
              className={styles.sendGlyph}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
            >
              <ArrowUp aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </Tooltip>
  );
}

interface ModelMenuProps {
  models: ModelOption[];
  model: ModelOption;
  reduced: boolean;
  onModel: (id: string) => void;
}

/** "≈$0.033/100" — só o custo (o provedor de terceiros fica escondido; a marca é Heretic). */
function modelMeta(option: ModelOption): string {
  if (typeof option.cost100 === "number" && isFinite(option.cost100)) {
    // Three decimals while costs sit below a dime, so cheap models stay distinguishable.
    return `≈$${option.cost100 < 0.1 ? option.cost100.toFixed(3) : option.cost100.toFixed(2)}/100`;
  }
  return "";
}

function ModelMenu({ models, model, reduced, onModel }: ModelMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const pointer = useRef(false);
  const anyLocked = models.some((option) => option.locked);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          ref={trigger}
          className={styles.modelChip}
          aria-label={`Model: ${model.name}`}
          onPointerDown={() => {
            pointer.current = true;
          }}
          onKeyDown={() => {
            pointer.current = false;
          }}
        >
          <ModelMask />
          <WidthMorph reduced={reduced} className={styles.modelText}>
            <span className={styles.modelName}>{model.short.replace(/^Heretic\s+/, "")}</span>
          </WidthMorph>
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cx(styles.menu, styles.modelMenu)}
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          loop
          onCloseAutoFocus={(event) => {
            if (!pointer.current) return;
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
          onPointerDownCapture={() => {
            pointer.current = true;
          }}
          onKeyDownCapture={() => {
            pointer.current = false;
          }}
        >
          <DropdownMenu.RadioGroup
            value={model.id}
            onValueChange={(id) => {
              const next = models.find((option) => option.id === id);
              if (next && !next.locked) onModel(id);
            }}
          >
            {models.map((option) => {
              const pill = option.locked ? (option.badge ?? "Pro") : option.badge;
              const meta = modelMeta(option);
              return (
                <DropdownMenu.RadioItem
                  key={option.id}
                  value={option.id}
                  disabled={option.locked}
                  className={cx(styles.menuItem, styles.modelItem)}
                >
                  <ModelMask />
                  <span className={styles.modelItemText}>
                    <span className={styles.modelItemName}>
                      {option.name}
                      {option.locked ? <Lock className={styles.lockGlyph} aria-hidden="true" /> : null}
                      {option.locked ? <span className={styles.srOnly}>, locked</span> : null}
                    </span>
                    <span className={styles.modelItemNote}>{option.note}</span>
                    {meta ? <span className={styles.modelCost}>{meta}</span> : null}
                  </span>
                  {pill ? <span className={styles.proPill}>{pill}</span> : null}
                  <DropdownMenu.ItemIndicator className={styles.modelCheck}>
                    <Check aria-hidden="true" />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Label className={styles.menuFoot}>
            {anyLocked ? t("Pro models unlock with credits. ") : ""}{t("Cost shown is ≈ per 100 messages.")}
          </DropdownMenu.Label>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Remaining characters, ring or warning, only shown once the message is close to the limit. */
function LengthCounter({ length, max }: { length: number; max: number }) {
  const ratio = length / max;
  const over = length > max;
  const left = max - length;
  const message = over
    ? `${(-left).toLocaleString("en-US")} characters over the limit`
    : `${left.toLocaleString("en-US")} of ${max.toLocaleString("en-US")} characters left`;
  return (
    <Tooltip content={message}>
      <span className={styles.counter} data-tone={over ? "over" : ratio >= 0.95 ? "near" : "calm"}>
        {over ? (
          <TriangleAlert className={styles.counterIcon} aria-hidden="true" />
        ) : (
          <svg className={styles.counterRing} viewBox="0 0 20 20" aria-hidden="true">
            <circle className={styles.ringTrack} cx="10" cy="10" r="8" />
            <circle
              className={styles.counterFill}
              cx="10"
              cy="10"
              r="8"
              pathLength={1}
              strokeDasharray="1 1"
              style={{ strokeDashoffset: 1 - Math.min(1, ratio) }}
            />
          </svg>
        )}
        <span className={styles.counterText}>
          {over ? `${(-left).toLocaleString("en-US")} over` : `${left.toLocaleString("en-US")} ${t("left")}`}
        </span>
        <span className={styles.srOnly}>{message}</span>
      </span>
    </Tooltip>
  );
}

function DictationTimer({ from }: { from: number }) {
  const [now, setNow] = useState(from);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - from) / 1000));
  return (
    <span className={cx(styles.timer, styles.tabular)}>
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

interface MirrorProps {
  text: string;
  placeholder: string;
  ranges: TokenRange[];
  anchor: number | null;
  anchorRef: RefObject<HTMLSpanElement | null>;
}

/** Paints the text the textarea cannot: placeholder while empty, tinted `/` tokens, and the popover anchor. */
function Mirror({ text, placeholder, ranges, anchor, anchorRef }: MirrorProps) {
  if (!text) return <span className={styles.mirrorPlaceholder}>{placeholder}</span>;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const push = (end: number) => {
    if (end <= cursor) return;
    if (anchor !== null && anchor >= cursor && anchor < end) {
      nodes.push(text.slice(cursor, anchor));
      nodes.push(<span ref={anchorRef} key="anchor" />);
      nodes.push(text.slice(anchor, end));
    } else {
      nodes.push(text.slice(cursor, end));
    }
    cursor = end;
  };
  for (const range of ranges) {
    push(range.start);
    nodes.push(
      <mark key={range.start} className={styles.token} data-kind="command">
        {range.text}
      </mark>,
    );
    cursor = range.end;
  }
  push(text.length);
  return (
    <>
      {nodes}
      {"​"}
    </>
  );
}

export interface ComposerHandle {
  focus: () => void;
  fill: (text: string) => void;
  addFiles: (files: File[]) => void;
}

export interface ComposerProps {
  models: ModelOption[];
  model: ModelOption;
  onModel: (id: string) => void;
  busy: boolean;
  /** Reply progress, 0 to 1; `null` spins the ring instead. */
  progress?: number | null;
  progressSeconds?: number;
  run?: number;
  placeholder?: string;
  maxLength?: number;
  reduced?: boolean;
  /** When set, sending is unavailable and this is the reason (shown as the send label). */
  blocked?: string | null;
  onSubmit: (payload: SubmitPayload) => void;
  onStop: () => void;
  /** Screen-reader messages; the composer keeps its own live region when this is omitted. */
  announce?: (message: string) => void;
  /** Modo Qualidade (Pro): switch no compositor. Só aparece quando qualityAvailable. */
  quality?: boolean;
  onQuality?: () => void;
  qualityAvailable?: boolean;
}

type Option = { id: string; command: CommandOption };

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    models,
    model,
    onModel,
    busy,
    progress = null,
    progressSeconds = 0,
    run = 0,
    placeholder = t("Ask anything"),
    maxLength = 16000,
    reduced: reducedProp,
    blocked = null,
    onSubmit,
    onStop,
    announce: announceProp,
    quality = false,
    onQuality,
    qualityAvailable = false,
  },
  ref,
) {
  const prefersReduced = useReducedMotion() ?? false;
  const reduced = reducedProp ?? prefersReduced;
  const [said, setSaid] = useState("");
  const announceRef = useRef(announceProp);
  announceRef.current = announceProp;
  const announce = useCallback((message: string) => {
    if (announceRef.current) announceRef.current(message);
    else setSaid(message);
  }, []);

  const [value, setValue] = useState("");
  const [tokens, setTokens] = useState<string[]>([]);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [suppressedStart, setSuppressedStart] = useState<number | null>(null);
  const [list, setList] = useState({ key: "", index: 0 });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dictation, setDictation] = useState<{ startedAt: number; phase: "listening" | "transcribing" } | null>(
    null,
  );
  const [heard, setHeard] = useState("");
  const [canDictate] = useState(() => speechRecognition() !== null);
  const [height, setHeight] = useState(40);
  const [listPos, setListPos] = useState<{ left: number; bottom: number } | null>(null);

  const surface = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastCaret = useRef(0);
  const dictationInsert = useRef<number | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const transcript = useRef("");
  const discard = useRef(false);
  const listId = useId();
  const hintId = useId();

  const ranges = useMemo(() => findTokens(value, tokens), [value, tokens]);
  const caretInfo = useMemo(
    () => (focused && !dictation ? detectTrigger(value, caret, ranges) : null),
    [focused, dictation, value, caret, ranges],
  );
  const trigger = caretInfo && caretInfo.start !== suppressedStart ? caretInfo : null;
  const results = useMemo<Option[]>(() => {
    if (!trigger) return [];
    const query = trigger.query.toLowerCase();
    return COMMANDS.filter((command) => command.id.startsWith(query)).map((command) => ({ id: command.id, command }));
  }, [trigger]);
  const open = !!(trigger && results.length);
  const listKey = trigger ? `/${trigger.start}${trigger.query}` : "";
  const activeIndex = Math.min(list.key === listKey ? list.index : 0, Math.max(0, results.length - 1));
  const setIndex = (index: number) => setList({ key: listKey, index });
  const activeOption: Option | undefined = open ? results[activeIndex] : undefined;

  /* Textarea growth: the mirror is the real box, the textarea follows its height. */
  useLayoutEffect(() => {
    const node = mirror.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setHeight(Math.min(208, Math.max(40, Math.ceil(node.offsetHeight))));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* The command popover hangs off the `/`, measured from the surface box. */
  useLayoutEffect(() => {
    if (!open) return;
    const anchorNode = anchor.current;
    const surfaceNode = surface.current;
    if (!anchorNode || !surfaceNode) return;
    const anchorBox = anchorNode.getBoundingClientRect();
    const surfaceBox = surfaceNode.getBoundingClientRect();
    const width = Math.min(300, surfaceBox.width - 12);
    const left = Math.max(6, Math.min(anchorBox.left - surfaceBox.left - 12, surfaceBox.width - width - 6));
    const bottom = surfaceBox.bottom - anchorBox.top + 8;
    setListPos((previous) =>
      previous && previous.left === left && previous.bottom === bottom ? previous : { left, bottom },
    );
  }, [open, trigger?.start, value, height]);

  const uploading = attachments.some((item) => item.status === "uploading");

  /* A read file shows its tick briefly, then settles to its name and size. */
  const doneIds = attachments
    .filter((item) => item.status === "done")
    .map((item) => item.id)
    .join(",");
  useEffect(() => {
    if (!doneIds) return;
    const ids = doneIds.split(",");
    const names = attachments.filter((item) => ids.includes(item.id)).map((item) => item.name);
    announce(names.length === 1 ? `${names[0]} attached` : `${names.length} files attached`);
    const timer = window.setTimeout(() => {
      setAttachments((items) =>
        items.map((item) => (ids.includes(item.id) && item.status === "done" ? { ...item, status: "ready" } : item)),
      );
    }, 900);
    return () => window.clearTimeout(timer);
  }, [doneIds]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Stop listening if the composer goes away mid-dictation. */
  useEffect(
    () => () => {
      discard.current = true;
      recognition.current?.abort();
    },
    [],
  );

  const focusCaret = useCallback((next?: number) => {
    const node = input.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    if (next !== undefined) {
      node.setSelectionRange(next, next);
      lastCaret.current = next;
      setCaret(next);
    }
  }, []);

  const replaceRange = useCallback(
    (start: number, end: number, text: string) => {
      const node = input.current;
      if (!node) return;
      node.focus({ preventScroll: true });
      node.setSelectionRange(start, end);
      const applied =
        (text ? document.execCommand("insertText", false, text) : document.execCommand("delete")) || false;
      if (!applied) {
        setValue(node.value.slice(0, start) + text + node.value.slice(end));
        requestAnimationFrame(() => focusCaret(start + text.length));
      }
      const next = start + text.length;
      lastCaret.current = next;
      setCaret(next);
    },
    [focusCaret],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const items = files.map((file) => {
        const extension = extensionOf(file.name);
        const error = !isTextFile(file) ? t("Text files only") : file.size > MAX_FILE_BYTES ? t("Over 200 KB") : undefined;
        return {
          id: nextAttachmentId(),
          source: "file",
          kind: fileKind(file.name),
          name: file.name || t("Pasted file"),
          size: file.size,
          meta: `${extension ? extension.toUpperCase() : "Text"}, ${formatSize(file.size)}`,
          status: error ? "error" : "uploading",
          progress: 0,
          error,
        } satisfies Attachment;
      });
      setAttachments((current) => [...current, ...items]);
      const errors = items.filter((item) => item.status === "error");
      if (errors.length) {
        announce(`${errors.map((item) => item.name).join(", ")}: only text files up to 200 KB can be attached`);
      } else {
        announce(items.length === 1 ? `Reading ${items[0]?.name}` : `Reading ${items.length} files`);
      }
      items.forEach((item, index) => {
        const file = files[index];
        if (item.status === "error" || !file) return;
        const settleItem = (patch: Partial<Attachment>) =>
          setAttachments((current) => current.map((entry) => (entry.id === item.id ? { ...entry, ...patch } : entry)));
        file.text().then(
          (text) =>
            text.includes("\u0000")
              ? settleItem({ status: "error", error: t("Not a text file") })
              : settleItem({ status: "done", progress: 1, text }),
          () => settleItem({ status: "error", error: t("Couldn't read the file") }),
        );
      });
    },
    [announce],
  );

  const fill = useCallback(
    (text: string) => {
      setTokens(ALL_TOKENS.filter((token) => text.includes(token)));
      const node = input.current;
      if (!node) return;
      replaceRange(0, node.value.length, text);
      if (node.value !== text) setValue(text);
    },
    [replaceRange],
  );

  function select(option: Option) {
    if (!trigger) return;
    const token = option.command.label;
    setTokens((current) => [...current, token]);
    replaceRange(trigger.start, caret, `${token} `);
    announce(`${token} command added`);
  }

  useImperativeHandle(ref, () => ({ focus: () => focusCaret(), fill, addFiles }), [focusCaret, fill, addFiles]);

  const canSend = value.trim().length > 0;
  const sendable = attachments.filter((item) => item.status !== "error");
  const overLimit = value.length > maxLength;
  const state: "empty" | "ready" | "blocked" | "generating" = busy
    ? "generating"
    : canSend || sendable.length
      ? uploading || overLimit || dictation || blocked
        ? "blocked"
        : "ready"
      : "empty";
  const sendLabel =
    state === "generating"
      ? t("Stop generating")
      : blocked
        ? blocked
        : state === "empty"
          ? t("Send message")
          : uploading
            ? t("Send, after files are read")
            : overLimit
              ? t("Send, message is over the limit")
              : t("Send message");

  function submit() {
    if (state !== "ready") return;
    const found = findTokens(value, tokens).map((range) => range.text);
    onSubmit({ text: value.trim(), tokens: [...new Set(found)], attachments: sendable });
    setValue("");
    setTokens([]);
    setAttachments([]);
    setCaret(0);
    lastCaret.current = 0;
  }

  function removeAttachment(id: string) {
    const item = attachments.find((entry) => entry.id === id);
    if (item) announce(item.status === "uploading" ? `${item.name} canceled` : `${item.name} removed`);
    setAttachments((current) => current.filter((entry) => entry.id !== id));
    focusCaret();
  }

  /* Dictation: the browser's speech recognition, in the visitor's language; the transcript lands at the caret. */
  function startDictation() {
    const Recognition = speechRecognition();
    if (!Recognition || recognition.current) return;
    const rec = new Recognition();
    rec.lang = lang === "pt" ? "pt-BR" : navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    discard.current = false;
    transcript.current = "";
    setHeard("");
    dictationInsert.current = input.current?.selectionStart ?? value.length;
    rec.onresult = (event) => {
      let text = "";
      for (let index = 0; index < event.results.length; index += 1) {
        text += event.results[index]?.[0]?.transcript ?? "";
      }
      transcript.current = text;
      setHeard(text.replace(/\s+/g, " ").trim());
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        announce(t("Microphone access is blocked"));
      } else if (event.error === "no-speech") {
        announce(t("Nothing was heard"));
      } else if (event.error !== "aborted") {
        announce(t("Dictation stopped"));
      }
    };
    rec.onend = () => {
      recognition.current = null;
      const text = discard.current ? "" : transcript.current.replace(/\s+/g, " ").trim();
      setDictation(null);
      setHeard("");
      if (discard.current) return;
      if (!text) {
        focusCaret();
        return;
      }
      const node = input.current;
      const at = Math.min(dictationInsert.current ?? node?.value.length ?? 0, node?.value.length ?? 0);
      const before = node?.value.slice(0, at) ?? "";
      const gap = before && !/\s$/.test(before) ? " " : "";
      requestAnimationFrame(() => {
        replaceRange(at, at, `${gap}${text}`);
        announce(`Inserted: ${text}`);
      });
    };
    try {
      rec.start();
    } catch {
      announce(t("Dictation could not start"));
      return;
    }
    recognition.current = rec;
    setDictation({ startedAt: Date.now(), phase: "listening" });
    announce(t("Listening"));
  }

  function finishDictation() {
    setDictation((current) => (current && current.phase === "listening" ? { ...current, phase: "transcribing" } : current));
    recognition.current?.stop();
  }

  function cancelDictation() {
    discard.current = true;
    recognition.current?.abort();
    setDictation(null);
    setHeard("");
    announce(t("Dictation canceled"));
    focusCaret();
  }

  const counterVisible = value.length >= 0.8 * maxLength;
  const tone = overLimit ? "over" : counterVisible ? "near" : "calm";
  useEffect(() => {
    if (tone === "near") announce(`${(maxLength - value.length).toLocaleString("en-US")} characters left`);
    else if (tone === "over")
      announce(`Over the ${maxLength.toLocaleString("en-US")} character limit. Shorten the message to send it`);
  }, [tone]); // eslint-disable-line react-hooks/exhaustive-deps

  const optionId = (option: Option) => `${listId}-${option.id}`;

  const renderOption = (option: Option) => {
    const isActive = option === activeOption;
    const CommandIcon = COMMAND_ICONS[option.command.id] ?? FileText;
    return (
      <div
        key={option.id}
        id={optionId(option)}
        role="option"
        aria-selected={isActive}
        className={styles.option}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => select(option)}
        onMouseMove={() => {
          if (!isActive) setIndex(results.indexOf(option));
        }}
      >
        <CommandIcon className={styles.optionGlyph} aria-hidden="true" />
        <span className={styles.optionText}>
          <span className={styles.optionLabel}>{option.command.label}</span>
          <span className={styles.optionHint}>{option.command.hint}</span>
        </span>
      </div>
    );
  };

  return (
    <div className={styles.composer}>
      <div
        ref={surface}
        className={styles.surface}
        data-focused={focused || undefined}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target === event.currentTarget || target.dataset.focusArea !== undefined) {
            event.preventDefault();
            focusCaret();
          }
        }}
      >
        <AnimatePresence initial={false}>
          {attachments.length > 0 && (
            <motion.div
              key="attachments"
              className={styles.attachmentsClip}
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
              transition={reduced ? { duration: duration.fast } : spring.smooth}
            >
              <ul className={styles.attachments} aria-label="Attachments">
                <AnimatePresence initial={false} mode="popLayout">
                  {attachments.map((item) => (
                    <AttachmentChip key={item.id} item={item} reduced={reduced} onRemove={removeAttachment} />
                  ))}
                </AnimatePresence>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.field} data-focus-area="" data-dictating={dictation ? "" : undefined}>
          <div ref={backdrop} className={styles.backdrop} aria-hidden="true">
            <div ref={mirror} className={styles.mirror}>
              <Mirror
                text={value}
                placeholder={placeholder}
                ranges={ranges}
                anchor={open ? (trigger?.start ?? null) : null}
                anchorRef={anchor}
              />
            </div>
          </div>
          <textarea
            ref={input}
            className={styles.input}
            value={value}
            rows={1}
            placeholder={placeholder}
            aria-label={t("Message Heretic")}
            aria-describedby={hintId}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
            aria-autocomplete="list"
            readOnly={!!dictation}
            spellCheck
            style={{ height, overflowY: height >= 208 ? "auto" : "hidden" }}
            onChange={(event) => {
              const next = event.target.value;
              const position = event.target.selectionStart;
              setValue(next);
              setTokens((current) => current.filter((token) => findTokens(next, [token]).length));
              if (suppressedStart !== null && !detectTrigger(next, position, findTokens(next, tokens))) {
                setSuppressedStart(null);
              }
              lastCaret.current = position;
              setCaret(position);
            }}
            onKeyDown={(event) => {
              const node = event.currentTarget;
              if (open && trigger) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  if (results.length) {
                    setIndex((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
                  }
                  return;
                }
                if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && activeOption) {
                  event.preventDefault();
                  select(activeOption);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setSuppressedStart(trigger.start);
                  return;
                }
              }
              if (event.key === "Escape") {
                if (dictation) {
                  event.preventDefault();
                  cancelDictation();
                  return;
                }
                if (busy) {
                  event.preventDefault();
                  onStop();
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
                return;
              }
              const position = node.selectionStart;
              if (position === node.selectionEnd) {
                if (event.key === "Backspace") {
                  const range = ranges.find((entry) => entry.end === position);
                  if (range) {
                    event.preventDefault();
                    replaceRange(range.start, range.end, "");
                  }
                } else if (event.key === "Delete") {
                  const range = ranges.find((entry) => entry.start === position);
                  if (range) {
                    event.preventDefault();
                    replaceRange(range.start, range.end, "");
                  }
                }
              }
            }}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files);
              if (files.length) {
                event.preventDefault();
                addFiles(files);
                return;
              }
              const text = event.clipboardData.getData("text/plain");
              const lines = text.split(/\r\n|\r|\n/).length;
              if (lines < 12 && text.length < 1200) return;
              event.preventDefault();
              setAttachments((current) => [
                ...current,
                {
                  id: nextAttachmentId(),
                  source: "paste",
                  kind: "text",
                  name: t("Pasted text"),
                  meta: `${lines} ${lines === 1 ? "line" : "lines"}`,
                  size: text.length,
                  status: "ready",
                  progress: 1,
                  text,
                },
              ]);
              announce(`Long paste added as an attachment, ${lines} lines`);
            }}
            onSelect={(event) => {
              const node = event.currentTarget;
              const position = node.selectionStart;
              if (position === node.selectionEnd) {
                const range = ranges.find((entry) => position > entry.start && position < entry.end);
                if (range) {
                  const snapped =
                    Math.abs(position - lastCaret.current) <= 1
                      ? position > lastCaret.current
                        ? range.end
                        : range.start
                      : position - range.start < range.end - position
                        ? range.start
                        : range.end;
                  node.setSelectionRange(snapped, snapped);
                  lastCaret.current = snapped;
                  setCaret(snapped);
                  return;
                }
              }
              lastCaret.current = position;
              setCaret(position);
            }}
            onScroll={(event) => {
              if (backdrop.current) backdrop.current.scrollTop = event.currentTarget.scrollTop;
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <span id={hintId} className={styles.srOnly}>
            Enter sends, Shift Enter adds a line. Type slash at the start of a line for commands.
          </span>
          <AnimatePresence>
            {dictation && (
              <motion.div
                key="dictation"
                className={styles.dictation}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: duration.fast } }}
                transition={{ duration: duration.standard, ease: [...ease.enter] }}
              >
                <Tooltip content={t("Cancel dictation")}>
                  <button
                    type="button"
                    className={styles.dictationButton}
                    aria-label={t("Cancel dictation")}
                    onClick={cancelDictation}
                  >
                    <X aria-hidden="true" />
                  </button>
                </Tooltip>
                {heard ? (
                  <span className={styles.transcript} aria-hidden="true">
                    <span>{heard}</span>
                  </span>
                ) : (
                  <span className={styles.transcribing}>
                    <TextShimmer>{dictation.phase === "listening" ? t("Listening") : t("Transcribing")}</TextShimmer>
                  </span>
                )}
                <DictationTimer from={dictation.startedAt} />
                <Tooltip content={t("Insert the transcript")}>
                  <button
                    type="button"
                    className={cx(styles.dictationButton, styles.dictationDone)}
                    aria-label={t("Insert the transcript")}
                    onClick={finishDictation}
                    disabled={dictation.phase !== "listening"}
                  >
                    <Check aria-hidden="true" />
                  </button>
                </Tooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={styles.toolbar}>
          {/* Barra igual ao mockup do Claude Design: [+] [mic] [modelo] à esquerda; [⌘K] [enviar] à direita. */}
          <div className={styles.toolGroup}>
            <Tooltip content={t("Attach a text file")}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t("Attach a text file")}
                onClick={() => fileInput.current?.click()}
              >
                <Plus aria-hidden="true" />
              </button>
            </Tooltip>
            {canDictate ? (
              <Tooltip content={dictation ? t("Insert the transcript") : t("Dictate")}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={dictation ? t("Stop dictation and insert") : t("Dictate")}
                  aria-pressed={!!dictation}
                  data-live={dictation ? "" : undefined}
                  onClick={() => (dictation ? finishDictation() : startDictation())}
                  disabled={busy && !dictation}
                >
                  <Mic aria-hidden="true" />
                </button>
              </Tooltip>
            ) : null}
            <ModelMenu models={models} model={model} reduced={reduced} onModel={onModel} />
            {qualityAvailable && onQuality ? (
              <Tooltip content={t("Quality mode: race 2 models, keep the best")}>
                <button
                  type="button"
                  className="hx-qswitch"
                  role="switch"
                  aria-checked={!!quality}
                  aria-label={t("Quality")}
                  data-on={quality ? "1" : "0"}
                  onClick={onQuality}
                >
                  <Zap aria-hidden="true" />
                  <span className="hx-qswitch-label">{t("Quality")}</span>
                  <span className="hx-qswitch-track" aria-hidden="true"><span className="hx-qswitch-thumb" /></span>
                </button>
              </Tooltip>
            ) : null}
          </div>
          <div className={styles.toolGroup}>
            <AnimatePresence initial={false}>
              {counterVisible && (
                <motion.span
                  key="counter"
                  className={styles.counterWrap}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, width: 0 }}
                  transition={reduced ? { duration: duration.fast } : settle}
                >
                  <LengthCounter length={value.length} max={maxLength} />
                </motion.span>
              )}
            </AnimatePresence>
            <span className="hx-cmdk" aria-hidden="true">Cmd+K</span>
            <SendButton
              state={state}
              progress={progress}
              progressSeconds={progressSeconds}
              run={run}
              label={sendLabel}
              reduced={reduced}
              onSend={submit}
              onStop={onStop}
            />
          </div>
        </div>

        <AnimatePresence>
          {open && listPos && trigger && (
            <motion.div
              key="commands"
              id={listId}
              role="listbox"
              aria-label={t("Commands")}
              className={styles.pop}
              style={{ left: listPos.left, bottom: listPos.bottom }}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduced
                  ? { opacity: 0, transition: { duration: 0 } }
                  : { opacity: 0, y: 4, scale: 0.99, transition: { duration: duration.instant } }
              }
              transition={reduced ? { duration: duration.instant } : settle}
            >
              {results.map(renderOption)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        accept={ACCEPT}
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
          focusCaret();
        }}
      />
      {announceProp ? null : (
        <span className={styles.srOnly} role="status" aria-live="polite">
          {said}
        </span>
      )}
    </div>
  );
});
