const fmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long", day: "2-digit", month: "long", year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export const hoje = () => fmt.format(new Date());

/** Vai no topo do bloco de sistema. */
export const dataSistema = () => `Hoje é ${hoje()}.`;

/** Repetida, invisível, no fim do turno ao vivo. 32/40 → 40/40 de acerto. */
export const dataTurno = () => `[hoje: ${hoje()}]`;
