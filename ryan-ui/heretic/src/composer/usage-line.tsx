// Medidor compacto embaixo da caixa de mensagem: mostra a janela de uso mais perto do limite.
// Quando alguma janela esgota, a linha vira o aviso de quando o uso libera.
import styles from "./usage-line.module.css";
import { quotaMessage, tightestWindow } from "../api";
import type { Quota } from "../api";

export function UsageLine({ quota }: { quota: Quota }) {
  const win = tightestWindow(quota);
  if (!win) return null;
  const ratio = win.limit > 0 ? Math.min(1, win.used / win.limit) : 1;
  const tone = quota.blocked ? "out" : ratio < 0.8 ? "ok" : "high";
  const amount = `${win.used} de ${win.limit} mensagens`;
  return (
    <div className={styles.usage} data-tone={tone}>
      <span className={styles.text}>{quota.blocked ? quotaMessage(quota) : `${amount} · ${win.id === "5h" ? "em 5 horas" : win.id === "day" ? "hoje" : win.id === "week" ? "nesta semana" : "neste mês"}`}</span>
      <span className={styles.track} role="meter" aria-label="Mensagens usadas" aria-valuemin={0} aria-valuemax={win.limit} aria-valuenow={win.used} aria-valuetext={amount}>
        <span className={styles.fill} style={{ width: `${ratio * 100}%` }} />
      </span>
    </div>
  );
}
