// Roteador de modelo do 451 — decide quem responde ANTES da chamada e para onde escalar quando
// um modelo RECUSA no meio (entrega).
//
// Regra do dono (20/11): o modelo PEDIDO responde. Se a resposta dele for censurada, a recusa é
// anulada e o pedido vai para um modelo SEM CENSURA — que responde. Se não for censurada, o
// próprio modelo pedido entrega. Desde 21/11 (custo) a recusa nunca sobe para o Claude: vai de um
// sem censura para o outro e, por último, para a reserva sem censura (Dolphin).
//
// Nada aqui filtra conteúdo: o roteador só decide quem responde.

// Ids públicos estáveis (o catálogo pode trocar o api_model por baixo sem avisar).
export const MAX_ID = 'claude-sonnet-5-5';   // Max = Claude Opus 5.5 na Anthropic (com censura)
export const RAPID_ID = 'zai-org/glm-5.3-flash-uncensored'; // Rapid: sem censura, barato
export const TITAN_ID = 'nousresearch/hermes-4-405b';       // Titan: sem censura (também é o do grátis)
export const HAIKU_ID = 'claude-haiku-5-5';                 // degrau de baixo da escada Claude

// Escada de força (histórico, 20/11): do mais barato/fraco ao mais caro/forte. Desde 21/11 a recusa
// não sobe mais por ela (ver alternateFor); fica exportada só para quem mede.
export const LADDER = [HAIKU_ID, RAPID_ID, TITAN_ID, MAX_ID];

// Modelos sem censura de verdade: a recusa de um modelo com censura vai para eles.
// O Claude pede desculpa e o aberto entrega: por isso a recusa do Claude cai no Rapid.
export const UNCENSORED = [RAPID_ID, TITAN_ID];
// Última linha sem censura, fora da OpenUncensored (OpenRouter): entra quando Rapid e Titan já foram.
export const RESERVA_ID = 'cognitivecomputations/dolphin-mistral-24b-venice-edition';

// Baldes de assunto que NÃO ganham nada com raciocínio. Ficam exportados para quem quiser medir
// custo de raciocínio; o roteador NÃO desvia por isso (o modelo pedido responde).
const BALDES = [
  // Adulto / erótico
  /\b(er[oó]tic\w*|porn\w*|fetiche|nudes?|sexo\b)/i,
  // Gore / violência gráfica
  /\b(gore|g[oó]re|snuff|multila\w*|tortura\w*)/i,
  // Exploit / pentest
  /\b(exploit|shellcode|payload\s*(de|xss|sqli)|sql\s*injection|pentest|xss|sqli|rce|lfi|ssrf)/i,
];

// Sinais de que a pergunta pede raciocínio de verdade (não é "só faz").
const PEDE_RACIOCINIO = /\b(analis\w*|compar\w*|expliq\w*|explique|por que|porque|estrateg\w*|planej\w*|arquitet\w*|refator\w*|debug\w*|erro\b|traceback|stack\s*trace|stacktrace)\b/i;

/** Heurística local: a pergunta é "leve" (não pede raciocínio) e cai num balde sensível? */
export function looksLight(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (PEDE_RACIOCINIO.test(t)) return false;
  return BALDES.some((re) => re.test(t));
}

/**
 * Decide o modelo ANTES da chamada.
 * Regra do dono: o modelo pedido responde. O roteador NÃO desvia o pedido por assunto — se o
 * modelo recusar, a escalada troca na hora. Assim o Max responde quando entrega e o usuário vê
 * o modelo que escolheu. Ferramentas (agente/API) e arena também ficam no pedido.
 * @returns {{modelId: string, rerouted: boolean, reason?: string}}
 */
export function routeFor({ requestedId }) {
  return { modelId: requestedId, rerouted: false };
}

/**
 * Próximo modelo quando `currentId` RECUSOU.
 * Regra do dono (20/11): censura → um modelo SEM CENSURA responde; nunca repete quem recusou.
 * Regra do dono (21/11, custo): a recusa NUNCA sobe para o Claude (Opus/Haiku). Antes, a recusa do
 * Titan — inclusive no grátis — chamava o Opus: ~US$ 0,03–0,06 por vez, contra ~US$ 0,001. Agora
 * vai para o outro sem censura e, por último, para a reserva sem censura (Dolphin). O Opus só
 * responde quem escolheu o Max.
 * @param {string} currentId modelo que recusou
 * @param {{tried?: string[]}} [o] modelos já usados nesta mensagem
 * @returns {string|null} próximo modelo, ou null se não há para onde ir
 */
export function alternateFor(currentId, { tried = [] } = {}) {
  const jaTentou = new Set([currentId, ...tried]);
  const semCensura = UNCENSORED.find((id) => !jaTentou.has(id));
  if (semCensura) return semCensura;
  return jaTentou.has(RESERVA_ID) ? null : RESERVA_ID;
}
