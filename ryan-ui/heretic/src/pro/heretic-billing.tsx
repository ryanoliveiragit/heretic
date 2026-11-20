// GERADO por heretic-design/extra-build/localize.mjs (cfg-billing.json) a partir de ryan/billing-overview/billing-overview.tsx.
// Não edite à mão: ajuste a config e rode de novo.
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useIsPresent, useReducedMotion, type MotionProps } from "motion/react";
import { Check, CircleAlert, Clock3, Download, TriangleAlert } from "lucide-react";
import { AnimatedCounter } from "@pro/animated-counter/animated-counter";
import { Avatar } from "@pro/avatar/avatar";
import { Badge, type BadgeTone } from "@pro/badge/badge";
import { Button } from "@pro/button/button";
import { Input } from "@pro/input/input";
import SegmentedControl from "@pro/segmented-control/segmented-control";
import { TextMorph } from "@pro/text-morph/text-morph";
import { motionTokens } from "@pro/lib/motion-tokens";
import styles from "@pro/billing-overview/billing-overview.module.css";

/* ------------------------------------------------------------------ types */

type PlanId = "starter" | "growth" | "scale";
type BillingTerm = "monthly" | "yearly";
type InvoiceStatus = "paid" | "due" | "failed";
type CardMode = "summary" | "edit";
type DownloadState = "preparing" | "done";

interface Plan {
  name: string;
  rank: number;
  monthly: number;
  yearly: number;
  seats: number;
  calls: number;
  storage: number;
}

interface Subscription {
  plan: PlanId;
  billing: BillingTerm;
  renews: string;
  periodEnd: string;
  daysLeft: number;
  periodDays: number;
}

interface Invoice {
  id: string;
  date: string;
  title: string;
  detail: string;
  amount: number;
  status: InvoiceStatus;
}

interface CardForm {
  number: string;
  expiry: string;
  cvc: string;
}

type CardErrors = Partial<Record<keyof CardForm, string>>;

export interface BillingOverviewProps {
  /**
   * Set by the frame when the block is embedded in a host card: the visible header is dropped and
   * "Billing" is kept as visually hidden text so the section keeps its accessible name.
   */
  embedded?: boolean;
}

/* ------------------------------------------------------------------- data */

const PLANS: Record<PlanId, Plan> = {
  // Heretic: seats = tokens por dia, calls = imagens por dia (1.500 tokens cada), storage = modelos liberados.
  starter: { name: "Grátis", rank: 0, monthly: 0, yearly: 0, seats: 20_000, calls: 13, storage: 3 },
  growth: { name: "Pro", rank: 1, monthly: 49.99, yearly: 33.325, seats: 0, calls: 0, storage: 5 },
  scale: { name: "Pro", rank: 2, monthly: 49.99, yearly: 33.325, seats: 0, calls: 0, storage: 5 },
};

const PLAN_ORDER: PlanId[] = ["starter", "growth"];

const INITIAL_SUBSCRIPTION: Subscription = {
  plan: "starter",
  billing: "monthly",
  renews: "todo dia às 21h",
  periodEnd: "hoje",
  daysLeft: 30,
  periodDays: 30,
};

/** The term a plan switch starts: a new period from today, so its length replaces the days left. */
const TERMS: Record<BillingTerm, { renews: string; periodEnd: string; days: number }> = {
  monthly: { renews: "em 18 de dez. de 2026", periodEnd: "17 de dez.", days: 30 },
  yearly: { renews: "em 18 de nov. de 2027", periodEnd: "17 de nov. de 2027", days: 365 },
};

const INITIAL_INVOICES: Invoice[] = [];

const STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone; icon: ReactNode }> = {
  paid: { label: "Paga", tone: "success", icon: <Check size={12} strokeWidth={2} aria-hidden="true" /> },
  due: { label: "Em aberto", tone: "warning", icon: <Clock3 size={12} strokeWidth={2} aria-hidden="true" /> },
  failed: { label: "Falhou", tone: "danger", icon: <CircleAlert size={12} strokeWidth={2} aria-hidden="true" /> },
};

const EMPTY_CARD: CardForm = { number: "", expiry: "", cvc: "" };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moneyWhole = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("pt-BR");

/** What a plan costs over its term: yearly billing is charged once for twelve months. */
const planTotal = (plan: PlanId, billing: BillingTerm) => (billing === "monthly" ? PLANS[plan].monthly : 12 * PLANS[plan].yearly);

/** The allowance line under a plan name, in the same shorthand the picker rows use. */
function planFacts(plan: PlanId) {
  const { seats, storage } = PLANS[plan];
  return seats ? `${seats / 1_000} mil tokens por dia · ${storage} modelos` : `Sem limite diário · ${storage} modelos, com Max e Titan`;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** motionTokens easings are readonly tuples; motion's curve type wants a mutable four-number tuple. */
type Bezier = [number, number, number, number];

/* --------------------------------------------------------------- primitives */

/**
 * One line of copy. It rises in from below, and the copy it replaces lifts away — both driven by
 * AnimatePresence, so a leaving line is hidden from assistive tech while it is still on screen.
 */
function SwapPhase({ children, className, reduced }: { children: ReactNode; className?: string; reduced: boolean }) {
  const present = useIsPresent();
  return (
    <motion.span
      className={className}
      aria-hidden={present ? undefined : true}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: "0.35em" }}
      animate={{ opacity: 1, y: "0em" }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: "-0.3em", transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } }}
      transition={reduced ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}
    >
      {children}
    </motion.span>
  );
}

/** Copy that changes in place: the new line rises while the old one lifts out of the same slot. */
function SwapText({ children, className, anchor = "left" }: { children: string; className?: string; anchor?: "left" | "right" }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <span className={[styles.swap, className].filter(Boolean).join(" ")}>
      <AnimatePresence mode="popLayout" initial={false} anchorX={anchor}>
        <SwapPhase key={children} className={styles.swapText} reduced={reduced}>
          {children}
        </SwapPhase>
      </AnimatePresence>
    </span>
  );
}

/** Card digits turn column by column, each column a beat after the one before it. */
function CardDigits({ value }: { value: string }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <span className={styles.digits}>
      {value.split("").map((character, index) => (
        <span className={styles.digit} key={index}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={character}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: "0.7em" }}
              animate={{ opacity: 1, y: "0em" }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: "-0.7em", transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard], delay: 0.04 * index } }}
              transition={reduced ? { duration: 0 } : { default: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter], delay: 0.04 * index }, y: { ...motionTokens.spring.snappy, delay: 0.04 * index } }}
            >
              {character}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/** A region that springs to the measured height of whatever it currently holds (summary or picker). */
function HeightRegion({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div className={styles.region} initial={false} animate={{ height }} transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}>
      <div ref={innerRef} className={styles.regionInner}>
        {children}
      </div>
    </motion.div>
  );
}

interface UsageMeterProps {
  label: string;
  used: number;
  limit: number;
  decimals?: number;
  unit?: string;
  limitValue: number;
  limitSuffix?: string;
  left: string;
  valueText: string;
  index: number;
  /** The panel has been seen: the bar fills once, in a stagger by index. */
  revealed: boolean;
}

/**
 * One allowance: the counted figure, what it is counted against, the bar and the sentence a screen
 * reader gets instead of the bar.
 */
function UsageMeter({ label, used, limit, decimals = 0, unit, limitValue, limitSuffix, left, valueText, index, revealed }: UsageMeterProps) {
  const labelId = useId();
  const reduced = useReducedMotion() ?? false;
  const ratio = used / limit;
  const near = ratio >= 0.85;

  return (
    <div className={styles.meter} data-near={near || undefined}>
      <div className={styles.meterHead}>
        <span id={`${labelId}-label`}>{label}</span>
        <AnimatePresence initial={false}>
          {near && (
            <motion.span
              key="near"
              className={styles.nearBadge}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.9, transition: { duration: motionTokens.duration.exit, ease: [...motionTokens.ease.standard] } }}
              transition={reduced ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}
            >
              <Badge tone="warning" size="sm" icon={<TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />}>
                Perto do limite
              </Badge>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className={styles.meterValue}>
        <span className={styles.num}>
          <AnimatedCounter locale="pt-BR" value={used} decimals={decimals} animateOnView />
        </span>
        {unit && <span className={styles.meterUnit}>{unit}</span>}
        <span className={styles.meterOf}>
          de <span className={styles.num}>
            <AnimatedCounter locale="pt-BR" value={limitValue} suffix={limitSuffix} />
          </span>
        </span>
      </p>
      <div
        className={styles.track}
        role="meter"
        aria-labelledby={`${labelId}-label`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-valuetext={valueText}
      >
        <motion.span
          className={styles.fill}
          initial={{ width: "0%" }}
          animate={{ width: revealed ? `${Math.min(100, 100 * ratio)}%` : "0%" }}
          transition={reduced ? { duration: 0 } : { ...motionTokens.spring.smooth, delay: 0.06 * index }}
        />
      </div>
      <SwapText className={styles.meterCaption}>{`${Math.round(100 * ratio)}% usado · restam ${left}`}</SwapText>
    </div>
  );
}

/* -------------------------------------------------------------- the block */

/**
 * A billing settings page: a plan card that morphs into a plan picker with a monthly or yearly switch
 * and a prorated quote, usage meters that fill when seen, a payment card that edits in place and turns
 * its digits when replaced, and an invoice list with download and pay now. Plan, usage, card, and
 * invoices are simulated, so every charge in the quote is a preview.
 */
export function HereticBilling({ embedded = false }: BillingOverviewProps) {
  const id = useId();
  const reduced = useReducedMotion() ?? false;

  const [subscription, setSubscription] = useState<Subscription>(INITIAL_SUBSCRIPTION);
  const [view, setView] = useState<"summary" | "picker">("summary");
  const [draft, setDraft] = useState<{ plan: PlanId; billing: BillingTerm }>({ plan: "growth", billing: "yearly" });
  const [committing, setCommitting] = useState(false);
  const [planNotice, setPlanNotice] = useState("");
  const [card, setCard] = useState({ last4: "7719", expiry: "04/28" });
  const [cardMode, setCardMode] = useState<CardMode>("summary");
  const [form, setForm] = useState<CardForm>(EMPTY_CARD);
  const [errors, setErrors] = useState<CardErrors>({});
  const [saving, setSaving] = useState(false);
  const [cardNotice, setCardNotice] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [downloads, setDownloads] = useState<Record<string, DownloadState | undefined>>({});
  const [paying, setPaying] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const usageRef = useRef<HTMLElement>(null);
  const usageSeen = useInView(usageRef, { once: true, amount: 0.3 });
  const upgradeRef = useRef<HTMLButtonElement>(null);
  const updateRef = useRef<HTMLButtonElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const cvcRef = useRef<HTMLInputElement>(null);
  const planButtonRefs = useRef(new Map<PlanId, HTMLButtonElement>());
  const invoiceDownloadRefs = useRef(new Map<string, HTMLButtonElement>());
  /** A node to focus once the render that closes a panel has committed. */
  const focusAfterRender = useRef<(() => HTMLElement | null) | null>(null);
  const timeouts = useRef(new Set<number>());
  const invoiceCount = useRef(0);

  useEffect(() => {
    const take = focusAfterRender.current;
    if (!take) return;
    focusAfterRender.current = null;
    take()?.focus();
  });

  useEffect(() => {
    const pending = timeouts.current;
    return () => pending.forEach((timeout) => window.clearTimeout(timeout));
  }, []);

  const after = (ms: number, run: () => void) => {
    const timeout = window.setTimeout(() => {
      timeouts.current.delete(timeout);
      run();
    }, ms);
    timeouts.current.add(timeout);
  };

  const currentPlan = PLANS[subscription.plan];
  const nextPlan = PLANS[draft.plan];
  const isTopPlan = currentPlan.rank === PLAN_ORDER.length - 1;

  const sameTerm = draft.billing === subscription.billing;
  const overTerm = (planTotal(subscription.plan, subscription.billing) * subscription.daysLeft) / subscription.periodDays;
  const quote = {
    amount: round2((sameTerm ? (planTotal(draft.plan, draft.billing) * subscription.daysLeft) / subscription.periodDays : planTotal(draft.plan, draft.billing)) - overTerm),
    credit: round2(overTerm),
    sameTerm,
    renews: sameTerm ? subscription.renews : TERMS[draft.billing].renews,
    unchanged: draft.plan === subscription.plan && sameTerm,
  };

  const direction: "billing" | "up" | "down" = draft.plan === subscription.plan ? "billing" : nextPlan.rank > currentPlan.rank ? "up" : "down";
  const ctaLabel = quote.unchanged ? "Plano atual" : direction === "up" ? `Assinar o ${nextPlan.name}` : direction === "down" ? `Voltar para o ${nextPlan.name}` : (draft.billing === "yearly" ? "Mudar para anual" : "Mudar para mensal");
  const quoteDetail = quote.unchanged ? "Este é o seu plano atual" : quote.sameTerm ? `Proporcional a ${subscription.daysLeft} dias` : `Renova ${quote.renews} · ${money.format(quote.credit)} de crédito`;

  function closePicker() {
    if (committing) return;
    setView("summary");
    focusAfterRender.current = () => upgradeRef.current;
  }

  function selectPlan(plan: PlanId) {
    if (committing || false) return;
    setDraft((value) => ({ ...value, plan }));
  }

  function closeCardEditor() {
    if (saving) return;
    setCardMode("summary");
    focusAfterRender.current = () => updateRef.current;
  }

  function updateField(field: keyof CardForm, value: string) {
    const digits = value.replace(/\D/g, "");
    const next =
      field === "number"
        ? digits.slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ")
        : field === "expiry"
          ? (() => {
              const short = digits.slice(0, 4);
              return short.length > 2 ? `${short.slice(0, 2)}/${short.slice(2)}` : short;
            })()
          : digits.slice(0, 4);
    setForm((current) => ({ ...current, [field]: next }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  const reveal: MotionProps = {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] as Bezier } },
    transition: reduced ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] as Bezier, delay: 0.05 },
  };

  const meters: UsageMeterProps[] = [
    { index: 0, label: "Tokens hoje", used: 14_200, limit: currentPlan.seats || 14_200, limitValue: (currentPlan.seats || 14_200) / 1_000, limitSuffix: " mil", left: currentPlan.seats ? `${count.format(currentPlan.seats - 14_200)} tokens` : "sem limite", valueText: `14.200 de ${count.format(currentPlan.seats)} tokens usados hoje`, revealed: usageSeen },
    { index: 1, label: "Imagens hoje", used: 3, limit: currentPlan.calls || 3, limitValue: currentPlan.calls || 3, limitSuffix: "", left: currentPlan.calls ? `${currentPlan.calls - 3} imagens` : "sem limite", valueText: `3 de ${currentPlan.calls} imagens hoje`, revealed: usageSeen },
    { index: 2, label: "Modelos liberados", used: currentPlan.storage, limit: PLANS.growth.storage, limitValue: PLANS.growth.storage, limitSuffix: "", left: currentPlan.storage < PLANS.growth.storage ? `${PLANS.growth.storage - currentPlan.storage} só no Pro` : "todos", valueText: `${currentPlan.storage} de ${PLANS.growth.storage} modelos liberados`, revealed: usageSeen },
  ];

  return (
    <section className={styles.billing} aria-labelledby={`${id}-title`}>
      {embedded ? (
        <h2 id={`${id}-title`} className={styles.srOnly}>
          Planos e uso
        </h2>
      ) : (
        <header className={styles.header}>
          <h2 id={`${id}-title`}>Planos e uso</h2>
          <p>Sua conta no Heretic</p>
        </header>
      )}

      <div className={styles.top}>
        <section className={styles.panel} aria-labelledby={`${id}-plan`}>
          <div className={styles.panelHead}>
            <h3 id={`${id}-plan`}>Plano atual</h3>
            <SwapText className={styles.panelNote} anchor="right">
              {subscription.billing === "monthly" ? "Cobrança mensal" : `${moneyWhole.format(12 * currentPlan.yearly)} por ano`}
            </SwapText>
          </div>

          <div className={styles.planLine}>
            <TextMorph className={styles.planName}>{currentPlan.name}</TextMorph>
            <span className={styles.planPrice}>
              <span className={styles.num}>
                <AnimatedCounter locale="pt-BR" value={subscription.billing === "monthly" ? currentPlan.monthly : currentPlan.yearly} prefix="R$ " decimals={2} />
              </span>
              <span className={styles.per}>/ mês</span>
            </span>
          </div>

          <HeightRegion>
            <AnimatePresence mode="popLayout" initial={false}>
              {view === "summary" ? (
                <motion.div key="summary" className={styles.planSummary} {...reveal}>
                  <div className={styles.planFacts}>
                    <p>Renova {subscription.renews}</p>
                    <span>{planFacts(subscription.plan)}</span>
                  </div>
                  <Button
                    ref={upgradeRef}
                    type="button"
                    variant={isTopPlan ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => {
                      const next = PLAN_ORDER.find((plan) => PLANS[plan].rank > currentPlan.rank) ?? subscription.plan;
                      setDraft({ plan: next, billing: subscription.billing });
                      setPlanNotice("");
                      setView("picker");
                      focusAfterRender.current = () => planButtonRefs.current.get(next) ?? null;
                    }}
                  >
                    {isTopPlan ? "Trocar de plano" : "Assinar o Pro"}
                  </Button>
                  {planNotice && (
                    <p className={styles.notice}>
                      <Check size={14} strokeWidth={2} aria-hidden="true" />
                      {planNotice}
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="picker"
                  className={styles.picker}
                  {...reveal}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      closePicker();
                    }
                  }}
                >
                  <div className={styles.pickerHead}>
                    <div>
                      <h4 id={`${id}-picker`}>Trocar de plano</h4>
                      <p>No anual você economiza 33%</p>
                    </div>
                    <SegmentedControl
                      label="Período"
                      value={draft.billing}
                      onValueChange={(value) => {
                        if (committing) return;
                        setDraft((current) => ({ ...current, billing: value as BillingTerm }));
                      }}
                      options={[
                        { value: "monthly", label: "Mensal" },
                        { value: "yearly", label: "Anual" },
                      ]}
                    />
                  </div>

                  <div
                    className={styles.options}
                    role="radiogroup"
                    aria-labelledby={`${id}-picker`}
                    onKeyDown={(event) => {
                      const available = PLAN_ORDER;
                      const step = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[event.key];
                      const target =
                        event.key === "Home"
                          ? available[0]
                          : event.key === "End"
                            ? available[available.length - 1]
                            : step
                              ? available[(available.indexOf(draft.plan) + step + available.length) % available.length]
                              : undefined;
                      if (!target) return;
                      event.preventDefault();
                      selectPlan(target);
                      planButtonRefs.current.get(target)?.focus();
                    }}
                  >
                    {PLAN_ORDER.map((planId) => {
                      const plan = PLANS[planId];
                      const selected = draft.plan === planId;
                      const unavailable = false;
                      return (
                        <button
                          key={planId}
                          ref={(node) => {
                            if (node) planButtonRefs.current.set(planId, node);
                            else planButtonRefs.current.delete(planId);
                          }}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={unavailable}
                          tabIndex={selected ? 0 : -1}
                          className={styles.option}
                          onClick={() => selectPlan(planId)}
                        >
                          {selected && (
                            <motion.span layoutId="plan-highlight" className={styles.optionHighlight} transition={reduced ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" />
                          )}
                          <span className={styles.radio} aria-hidden="true" />
                          <span className={styles.optionName}>
                            {plan.name}
                            {planId === subscription.plan && <span className={styles.optionCurrent}>Atual</span>}
                          </span>
                          <span className={styles.optionMeta}>{unavailable ? `12 seats in use, ${plan.name} allows ${plan.seats}` : planFacts(planId)}</span>
                          <span className={styles.optionAmount}>
                            <span className={styles.num}>
                              <AnimatedCounter locale="pt-BR" value={draft.billing === "monthly" ? plan.monthly : plan.yearly} prefix="R$ " decimals={2} />
                            </span>
                            <span className={styles.per}>/mo</span>
                          </span>
                          <SwapText className={styles.optionBilled} anchor="right">
                            {draft.billing === "yearly" ? `${moneyWhole.format(12 * plan.yearly)} por ano` : "Cobrança mensal"}
                          </SwapText>
                        </button>
                      );
                    })}
                  </div>

                  <div className={styles.quote}>
                    <div className={styles.quoteText} aria-live="polite">
                      <SwapText className={styles.quoteLabel}>{quote.amount < 0 ? "Crédito na próxima fatura" : "A pagar hoje"}</SwapText>
                      <span className={styles.quoteAmount}>
                        <span className={styles.num}>
                          <AnimatedCounter locale="pt-BR" value={Math.abs(quote.amount)} prefix="$" decimals={2} />
                        </span>
                      </span>
                      <SwapText className={styles.quoteDetail}>{quoteDetail}</SwapText>
                    </div>
                    <div className={styles.quoteActions}>
                      <Button type="button" variant="ghost" size="sm" onClick={closePicker} disabled={committing}>
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={quote.unchanged}
                        loading={committing}
                        onClick={() => {
                          if (quote.unchanged || committing) return;
                          const plan = PLANS[draft.plan];
                          const term = TERMS[draft.billing];
                          const next: Subscription = quote.sameTerm
                            ? { ...subscription, plan: draft.plan }
                            : { plan: draft.plan, billing: draft.billing, renews: term.renews, periodEnd: term.periodEnd, daysLeft: term.days, periodDays: term.days };
                          const verb = direction === "billing" ? (draft.billing === "yearly" ? "Agora a cobrança é anual" : "Agora a cobrança é mensal") : direction === "up" ? `Agora você é ${plan.name}` : `Agora no plano ${plan.name}`;
                          const message =
                            quote.amount > 0
                              ? `${verb}. ${money.format(quote.amount)} cobrado no cartão final ${card.last4}.`
                              : quote.amount < 0
                                ? `${verb}. ${money.format(-quote.amount)} de crédito na próxima fatura.`
                                : `${verb}.`;
                          const invoice: Invoice | null =
                            quote.amount > 0
                              ? {
                                  id: `change-${++invoiceCount.current}`,
                                  date: "18 de nov. de 2026",
                                  title: `Plano ${plan.name}`,
                                  detail: quote.sameTerm ? `Proporcional, 18 de nov. – ${subscription.periodEnd}` : `${draft.billing === "yearly" ? "Yearly" : "Monthly"}, 18 de nov. – ${term.periodEnd}`,
                                  amount: quote.amount,
                                  status: "paid",
                                }
                              : null;
                          setCommitting(true);
                          after(900, () => {
                            setCommitting(false);
                            setSubscription(next);
                            setView("summary");
                            setPlanNotice(message);
                            setStatus(message);
                            if (invoice) setInvoices((list) => [invoice, ...list]);
                            focusAfterRender.current = () => upgradeRef.current;
                          });
                        }}
                      >
                        {ctaLabel}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </HeightRegion>
        </section>

        <section className={styles.panel} aria-labelledby={`${id}-payment`}>
          <div className={styles.panelHead}>
            <h3 id={`${id}-payment`}>Forma de pagamento</h3>
          </div>

          <div className={styles.cardRow}>
            <div className={styles.cardFace} aria-hidden="true">
              <span className={styles.cardTop}>
                <span className={styles.chip} />
                <span>Pessoal</span>
              </span>
              <span className={styles.cardBottom}>
                <span className={styles.cardHolder}>Você</span>
                <span className={styles.cardNumber}>
                  <span>••••</span>
                  <CardDigits value={card.last4} />
                </span>
                <span className={styles.cardExpiry}>
                  <CardDigits value={card.expiry} />
                </span>
              </span>
            </div>
            <div className={styles.cardDetails}>
              <SwapText className={styles.cardTitle}>{`Cartão final ${card.last4}`}</SwapText>
              <SwapText className={styles.cardMeta}>{`Vence em ${card.expiry}`}</SwapText>
              <Button
                ref={updateRef}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setForm(EMPTY_CARD);
                  setErrors({});
                  setCardNotice("");
                  setCardMode("edit");
                  focusAfterRender.current = () => numberRef.current;
                }}
                disabled={cardMode === "edit"}
              >
                Trocar
              </Button>
            </div>
          </div>

          <HeightRegion>
            <AnimatePresence mode="popLayout" initial={false}>
              {cardMode === "edit" ? (
                <motion.form
                  key="edit"
                  className={styles.cardForm}
                  noValidate
                  aria-label="Cartão novo"
                  {...reveal}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (saving) return;
                    const found: CardErrors = {};
                    if (form.number.replace(/\D/g, "").length !== 16) found.number = "Digite os 16 números";
                    const [month, year] = form.expiry.split("/").map(Number);
                    if (!/^\d{2}\/\d{2}$/.test(form.expiry) || month < 1 || month > 12) found.expiry = "Use MM/AA, como 08/29";
                    else if (year < 26 || (year === 26 && month < 9)) found.expiry = "Este cartão venceu";
                    if (!/^\d{3,4}$/.test(form.cvc)) found.cvc = "Digite 3 ou 4 números";
                    setErrors(found);
                    const first = found.number ? numberRef : found.expiry ? expiryRef : found.cvc ? cvcRef : null;
                    if (first) {
                      first.current?.focus();
                      return;
                    }
                    const next = { last4: form.number.replace(/\D/g, "").slice(-4), expiry: form.expiry };
                    setSaving(true);
                    after(900, () => {
                      const message = `Cartão final ${next.last4} salvo. As próximas cobranças usam ele.`;
                      setSaving(false);
                      setCard(next);
                      setCardMode("summary");
                      setCardNotice(message);
                      setStatus(message);
                      focusAfterRender.current = () => updateRef.current;
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      closeCardEditor();
                    }
                  }}
                >
                  <Input
                    ref={numberRef}
                    label="Número do cartão"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="1234 1234 1234 1234"
                    value={form.number}
                    error={errors.number}
                    onChange={(event) => updateField("number", event.target.value)}
                  />
                  <div className={styles.formRow}>
                    <Input
                      ref={expiryRef}
                      label="Validade"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/AA"
                      value={form.expiry}
                      error={errors.expiry}
                      onChange={(event) => updateField("expiry", event.target.value)}
                    />
                    <Input
                      ref={cvcRef}
                      label="Código de segurança"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      value={form.cvc}
                      error={errors.cvc}
                      onChange={(event) => updateField("cvc", event.target.value)}
                    />
                  </div>
                  <div className={styles.formFoot}>
                    <span />
                    <div className={styles.formActions}>
                      <Button type="button" variant="ghost" size="sm" onClick={closeCardEditor} disabled={saving}>
                        Cancelar
                      </Button>
                      <Button type="submit" size="sm" loading={saving}>
                        Salvar cartão
                      </Button>
                    </div>
                  </div>
                </motion.form>
              ) : cardNotice ? (
                <motion.p key={cardNotice} className={`${styles.notice} ${styles.cardNotice}`} {...reveal}>
                  <Check size={14} strokeWidth={2} aria-hidden="true" />
                  {cardNotice}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </HeightRegion>
        </section>
      </div>

      <section ref={usageRef} className={styles.panel} aria-labelledby={`${id}-usage`}>
        <div className={styles.panelHead}>
          <h3 id={`${id}-usage`}>Uso de hoje</h3>
          <span className={styles.panelNote}>hoje, até as 21h</span>
        </div>
        <div className={styles.meters}>
          {meters.map(({ index, ...meter }) => (
            <UsageMeter key={meter.label} {...meter} index={index} />
          ))}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby={`${id}-invoices`}>
        <div className={styles.panelHead}>
          <h3 id={`${id}-invoices`}>Faturas</h3>
          <span className={styles.recipient}>
            Enviadas para o seu e-mail
          </span>
        </div>

        <ul className={styles.invoices}>
          <AnimatePresence initial={false}>
            {invoices.map((invoice) => {
              const meta = STATUS[invoice.status];
              const download = downloads[invoice.id];
              return (
                <motion.li
                  key={invoice.id}
                  className={styles.invoice}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduced ? { duration: 0 } : { height: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] } }}
                >
                  <div className={styles.invoiceRow}>
                    <span className={styles.invoiceText}>
                      <span className={styles.invoiceTitle}>{invoice.title}</span>
                      <SwapText className={styles.invoiceDetail}>{invoice.detail}</SwapText>
                    </span>
                    <span className={styles.invoiceAmount}>{money.format(invoice.amount)}</span>
                    <span className={styles.invoiceMeta}>
                      <span className={styles.invoiceDate}>{invoice.date}</span>
                      <span className={styles.invoiceStatus}>
                        <Badge tone={meta.tone} size="sm" icon={meta.icon}>
                          {meta.label}
                        </Badge>
                      </span>
                    </span>
                    <span className={styles.invoiceActions}>
                      <AnimatePresence mode="popLayout" initial={false}>
                        {invoice.status === "failed" && (
                          <motion.span
                            key="pay"
                            className={styles.payNow}
                            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.9, transition: { duration: motionTokens.duration.exit, ease: [...motionTokens.ease.standard] } }}
                          >
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              loading={paying === invoice.id}
                              aria-label={`Pagar ${money.format(invoice.amount)} de ${invoice.title}`}
                              onClick={() => {
                                if (paying) return;
                                const { last4 } = card;
                                setPaying(invoice.id);
                                after(1000, () => {
                                  setPaying(null);
                                  setInvoices((list) =>
                                    list.map((item) => (item.id === invoice.id ? { ...item, status: "paid", detail: `Paga em 18 de nov. com o cartão final ${last4}` } : item)),
                                  );
                                  setStatus(`Fatura ${money.format(invoice.amount)} de ${invoice.date} paga com o cartão final ${last4}.`);
                                  focusAfterRender.current = () => invoiceDownloadRefs.current.get(invoice.id) ?? null;
                                });
                              }}
                            >
                              Pagar agora
                            </Button>
                          </motion.span>
                        )}
                      </AnimatePresence>
                      <Button
                        ref={(node) => {
                          if (node) invoiceDownloadRefs.current.set(invoice.id, node);
                          else invoiceDownloadRefs.current.delete(invoice.id);
                        }}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.iconButton}
                        loading={download === "preparing"}
                        aria-label={download === "done" ? `Fatura de ${invoice.date} baixada` : `Baixar fatura de ${invoice.date}`}
                        onClick={() => {
                          if (downloads[invoice.id]) return;
                          setDownloads((state) => ({ ...state, [invoice.id]: "preparing" }));
                          after(700, () => {
                            setDownloads((state) => ({ ...state, [invoice.id]: "done" }));
                            setStatus(`Fatura de ${invoice.date} baixada.`);
                            after(2200, () =>
                              setDownloads((state) => {
                                const next = { ...state };
                                delete next[invoice.id];
                                return next;
                              }),
                            );
                          });
                        }}
                      >
                        {download === "done" ? (
                          <Check className={styles.done} size={16} strokeWidth={2} aria-hidden="true" />
                        ) : (
                          <Download size={16} strokeWidth={1.75} aria-hidden="true" />
                        )}
                      </Button>
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </section>

      <p className={styles.srOnly} role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}

export default HereticBilling;
