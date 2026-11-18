import type { Card as C } from "../lib/cards";

export function Card({ card, onPick, travado }: { card: C; onPick: (v: string) => void; travado: boolean }) {
  return (
    <div role="radiogroup" aria-label={card.pergunta} style={{ display: "grid", gap: 6, margin: "10px 0" }}>
      <p style={{ margin: 0, opacity: 0.75, fontSize: 13 }}>{card.pergunta}</p>
      {card.opcoes.map((o) => (
        <button key={o.valor} role="radio" disabled={travado} onClick={() => onPick(o.valor)}
          style={{ textAlign: "left", padding: "9px 12px", borderRadius: 8, border: "1px solid #2a2a2e", background: "transparent", color: "inherit", cursor: travado ? "default" : "pointer" }}>
          <strong style={{ fontWeight: 500 }}>{o.rotulo}</strong>
          {o.desc && <span style={{ opacity: 0.6, fontSize: 12, display: "block" }}>{o.desc}</span>}
        </button>
      ))}
    </div>
  );
}
