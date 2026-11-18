const ABRE = /```\s*(?:ask|select|options?|choices?|escolha|op[çc][õo]es|pergunta)\b([\s\S]*?)(?:```|$)/gi;

export type Card = { tipo: "ask" | "escolha"; pergunta: string; opcoes: { valor: string; rotulo: string; desc?: string }[] };

export function acharCard(texto: string): Card | null {
  for (const m of texto.matchAll(ABRE)) {
    const linhas = (m[1] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const opcoes = linhas.filter((l) => /^[-*]\s+\S/.test(l)).map((l) => {
      const cru = l.replace(/^[-*]\s+/, "");
      const [rotulo, ...resto] = cru.split(/\s+—\s+/);
      return { valor: cru, rotulo, desc: resto.join(" — ") || undefined };
    });
    if (opcoes.length >= 2) {
      return { tipo: /escolha/i.test(m[0]) ? "escolha" : "ask", pergunta: linhas.find((l) => !/^[-*]\s/.test(l)) ?? "", opcoes };
    }
  }
  return null;
}

/** Corta no fence de fechamento. Não confia no modelo. */
export function cortarNoCard(texto: string): string {
  const m = texto.match(ABRE);
  if (!m) return texto;
  const fim = (m.index ?? 0) + m[0].length;
  return texto.slice(fim).trim() ? texto.slice(0, fim) : texto;
}
