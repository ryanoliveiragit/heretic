// Uso no rodapé da barra lateral (dono 18/11, no estilo do "Uso" do Claude): um anel no avatar mostra
// quanto ainda resta da janela mais apertada, e ao passar o mouse (ou tocar, no celular) abre o cartão
// "Uso" com cada modelo liberado: barra do que resta, "% restante" e quanto falta para renovar.
// Dados reais do /api/me e do evento "usage" do chat (os mesmos limites de Configurações, Planos e uso).
import type { ReactElement } from "react";
import { HoverCard } from "@pro/hover-card/hover-card";
import { Progress } from "@pro/progress/progress";
import type { Quota, QuotaWindow } from "./api";
import "./usage.css";

const WINDOW: Record<QuotaWindow["id"], string> = { "5h": "5 horas", day: "Diário", week: "Semanal", month: "Mensal" };

/** Quanto falta até a janela renovar: "3 d 7 h", "5 h 12 min", "12 min". */
function timeLeft(resetAt: number | null): string {
  if (!resetAt) return "";
  const min = Math.max(1, Math.round((resetAt - Date.now()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** A janela com menos sobra (proporcionalmente) é a que manda. */
function tightest(q: Quota): QuotaWindow | null {
  const ws = q.windows.filter(w => w.limit > 0);
  if (!ws.length) return null;
  return ws.reduce((a, b) => (b.remaining / b.limit < a.remaining / a.limit ? b : a));
}

interface Row { bucket: string; name: string; win: QuotaWindow; pct: number }

function rowsOf(quotas: Quota[], names: Record<string, string>): Row[] {
  return quotas
    .filter(q => q.resource === "messages" && q.available && names[q.bucket])
    .map(q => { const win = tightest(q); return win ? { bucket: q.bucket, name: names[q.bucket]!, win, pct: Math.round((win.remaining / win.limit) * 100) } : null; })
    .filter((r): r is Row => !!r);
}

/** Envolve o avatar do rodapé: anel do que resta + cartão "Uso" ao passar o mouse. */
export function UsageAvatar({ quotas, names, children }: { quotas: Quota[]; names: Record<string, string>; children: ReactElement }) {
  const rows = rowsOf(quotas, names);
  if (!rows.length) return children;
  const low = rows.reduce((a, b) => (b.pct < a.pct ? b : a));
  const content = (
    <div className="hx-usage">
      <p className="hx-usage-h">Uso de mensagens</p>
      {rows.map(r => (
        <div className="hx-usage-row" key={r.bucket}>
          <span className="hx-usage-name">{r.name}</span>
          <span className="hx-usage-win">{WINDOW[r.win.id]}</span>
          <Progress className="hx-usage-bar" value={r.win.remaining} max={r.win.limit} aria-label={`${r.name}: ${r.pct}% restante`} data-low={r.pct <= 20 ? "" : undefined} />
          <span className="hx-usage-pct" data-low={r.pct <= 20 ? "" : undefined}>{r.pct}% restante</span>
          <span className="hx-usage-left">{r.win.used > 0 ? timeLeft(r.win.resetAt) : "cheio"}</span>
        </div>
      ))}
    </div>
  );
  return (
    <HoverCard content={content} side="top" align="start" className="hx-usage-card">
      <span className="hx-usage-ring" tabIndex={0} role="img" aria-label={`Uso: ${low.pct}% restante em ${low.name}`}
        style={{ ["--hx-usage" as string]: `${low.pct}%` }} data-low={low.pct <= 20 ? "" : undefined}>
        {children}
      </span>
    </HoverCard>
  );
}
