// Compact daily-token meter shown under the composer: "Free · 12.3k of 20k tokens today".
// Green bar while under 80% of the limit, silver after; the out-of-tokens message replaces the line at 0.
import styles from "./usage-line.module.css";
import { t, lang } from "../i18n";

export const OUT_OF_TOKENS = t("You've used today's free tokens. They reset at midnight UTC.");

/** 950 → "950", 12_345 → "12.3k", 20_000 → "20k", 1_500_000 → "1.5M". */
export function compactTokens(value: number): string {
  const n = Math.max(0, value);
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export interface UsageLineProps {
  plan: string;
  used: number;
  limit: number;
  remaining: number;
}

export function UsageLine({ plan, used, limit, remaining }: UsageLineProps) {
  const ratio = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 1;
  const out = remaining <= 0;
  const tone = out ? "out" : ratio < 0.8 ? "ok" : "high";
  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : t("Free");
  const amount = `${compactTokens(used)} ${t("of")} ${compactTokens(limit)} tokens`;
  return (
    <div className={styles.usage} data-tone={tone}>
      <span className={styles.text}>{out ? OUT_OF_TOKENS : `${planLabel === "Free" ? t("Free") : planLabel} · ${amount} ${lang === "pt" ? "hoje" : "today"}`}</span>
      <span
        className={styles.track}
        role="meter"
        aria-label={t("Tokens used today")}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={amount}
      >
        <span className={styles.fill} style={{ width: `${ratio * 100}%` }} />
      </span>
    </div>
  );
}
