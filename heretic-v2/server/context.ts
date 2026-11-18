import { est } from "./tokens";

export type Msg = { role: "user" | "assistant" | "system"; content: string };

/** Poda de emergência: só quando a recusa antecipada não resolveu. */
export function cortarMeio(msgs: Msg[], ctxTokens: number, reserva: number): Msg[] {
  const budget = ctxTokens - reserva;
  let total = msgs.reduce((a, m) => a + est(m.content), 0);
  if (total <= budget) return msgs;

  const out = [...msgs];
  let i = 1;
  while (total > budget && i < out.length - 2) {
    total -= est(out[i].content);
    out.splice(i, 1);
    if (out[i]?.role === "assistant") i++;
  }
  return out;
}

export function resumir(msgs: Msg[]): string {
  const pedidos = msgs.filter((m) => m.role === "user").map((m) => m.content.replace(/\s+/g, " ").slice(0, 160)).slice(-8);
  const feito = msgs.filter((m) => m.role === "assistant").slice(-3).map((m) => m.content.replace(/\s+/g, " ").slice(0, 120));
  return `pedidos: ${pedidos.join(" | ") || "—"}; concluído: ${feito.join(" | ") || "—"}`;
}

export function compactar(msgs: Msg[]): Msg[] {
  const meio = msgs.slice(1, -2);
  if (meio.length < 4) return msgs;
  const out = [...msgs];
  out.splice(1, meio.length, { role: "system", content: `[resumo do trecho antigo: ${resumir(meio)}]` });
  return out;
}

export function uso(msgs: Msg[], ctxPublicado: number) {
  const used = msgs.reduce((a, m) => a + est(m.content), 0);
  return { used, limit: ctxPublicado, remaining: Math.max(0, ctxPublicado - used) };
}
