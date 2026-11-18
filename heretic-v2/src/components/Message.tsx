import { acharCard, cortarNoCard } from "../lib/cards";
import { Card } from "./Card";

export function Message({ m, onPick }: { m: any; onPick: (v: string) => void }) {
  const card = m.role === "assistant" ? acharCard(m.text) : null;
  const texto = card ? cortarNoCard(m.text) : m.text;

  return (
    <article data-role={m.role} data-state={m.state}>
      {m.recusou && (
        <details style={{ marginBottom: 6 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.6 }}>recusou, refazendo</summary>
          <div style={{ opacity: 0.5, fontSize: 13, whiteSpace: "pre-wrap" }}>{m.recusou}</div>
        </details>
      )}
      <div style={{ whiteSpace: "pre-wrap" }}>{texto}</div>
      {card && <Card card={card} onPick={onPick} travado={m.state !== "ok"} />}
      {m.state === "stopped" && !m.text && <em style={{ opacity: 0.5 }}>parado</em>}
    </article>
  );
}
