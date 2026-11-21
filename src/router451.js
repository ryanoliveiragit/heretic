// Roteador de modelo do 451 — decide quem responde ANTES da chamada e para onde escalar quando
// um modelo RECUSA no meio (entrega).
//
// Regra do dono (20/11): o modelo PEDIDO responde. Se a resposta dele for censurada, a recusa é
// anulada e o pedido vai para um modelo SEM CENSURA — que responde. Se não for censurada, o
// próprio modelo pedido entrega. A escada de força sobe do Haiku até o Opus 5.5.
//
// Nada aqui filtra conteúdo: o roteador só decide quem responde.

// Ids públicos estáveis (o catálogo pode trocar o api_model por baixo sem avisar).
export const MAX_ID = 'claude-sonnet-5-5';   // o Max do site = Claude Opus 5.5 na Anthropic
export const RAPID_ID = 'zai-org/glm-5.3-flash-uncensored'; // sem censura, barato
export const TITAN_ID = 'nousresearch/hermes-4-405b';       // sem censura, forte
export const HAIKU_ID = 'claude-haiku-5-5';                 // degrau de baixo da escada Claude

// Escada de força: do mais barato/fraco ao mais caro/forte. Serve para subir a recusa um degrau
// de cada vez e para saber quem já foi tentado.
export const LADDER = [HAIKU_ID, RAPID_ID, TITAN_ID, MAX_ID];

// Modelos sem censura de verdade: a recusa de um modelo com censura vai para eles.
// O Claude pede desculpa e o aberto entrega: por isso a recusa do Claude cai no Rapid.
export const UNCENSORED = [RAPID_ID, TITAN_ID];

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
 * Próximo degrau quando `currentId` RECUSOU.
 * Regra do dono: censura → modelo sem censura responde. Se o modelo atual JÁ é sem censura e
 * recusou, sobe um degrau na escada de força (nunca repete quem recusou).
 * @param {string} currentId modelo que recusou
 * @param {{tried?: string[]}} [o] modelos já tentados nesta rodada
 * @returns {string|null} próximo modelo, ou null se não há para onde ir
 */
export function alternateFor(currentId, { tried = [] } = {}) {
  const jaTentou = new Set([currentId, ...tried]);
  // 1) Modelo com censura recusou → entregar com modelo sem censura.
  if (!UNCENSORED.includes(currentId)) {
    const semCensura = UNCENSORED.find((id) => !jaTentou.has(id));
    if (semCensura) return semCensura;
  }
  // 2) Sem censura também recusou (ou já foi tentado) → sobe um degrau na escada de força.
  const inicio = LADDER.indexOf(currentId);
  for (let i = inicio + 1; i < LADDER.length; i++) if (!jaTentou.has(LADDER[i])) return LADDER[i];
  // 3) Já tentou tudo acima → tenta o que sobrou abaixo (resposta é melhor que recusa).
  for (const id of LADDER) if (!jaTentou.has(id)) return id;
  return null;
}
