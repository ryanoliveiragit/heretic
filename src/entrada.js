// Limites de entrada antes de chamar o modelo (dono 21/11: "nunca ficar no vermelho").
// O grátis já cortava o histórico em 48 mil caracteres. O Pro não tinha corte: o histórico só parava no
// limite do modelo (até ~1 milhão de tokens no Sonnet, ~US$ 2 numa mensagem só), e uma mensagem gigante
// passava do teto de gasto de uma vez, porque o teto confere o gasto antes, não o tamanho da mensagem.
export const FREE_MAX_INPUT_CHARS = 48000;
// 200 mil caracteres ≈ 50 mil tokens: no Sonnet, ~US$ 0,10 por mensagem sem cache. Ajuste pela env.
export const PRO_MAX_INPUT_CHARS = Number(process.env.PRO_MAX_INPUT_CHARS) || 200000;

const textoDe = (m) => (typeof m?.content === 'string' ? m.content : '');

/** Mantém as mensagens mais recentes até `limite` caracteres de texto; corta a mais antiga que sobrar. */
export function cortaHistorico(messages, limite = FREE_MAX_INPUT_CHARS) {
  let room = limite;
  const kept = [];
  for (const m of [...(messages || [])].reverse()) {
    if (room <= 0) break;
    const text = textoDe(m);
    kept.unshift(text.length > room ? { ...m, content: text.slice(0, room) } : m);
    room -= text.length;
  }
  // Resultado de ferramenta sem a chamada que o pediu quebra a API do modelo: não começa por ele.
  while (kept[0] && kept[0].role === 'tool') kept.shift();
  return kept;
}

/** Caracteres de texto das mensagens (para estimar os tokens de entrada antes de chamar). */
export const caracteresDe = (messages) => (messages || []).reduce((t, m) => t + textoDe(m).length, 0);
