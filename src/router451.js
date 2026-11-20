// Roteador de modelo do 451 — decide quem responde ANTES da chamada (economia) e para onde
// escalar quando um modelo recusa no meio (entrega).
//
// Histórico: a 1ª versão (branch homo-451, manhã de 20/11) nasceu da premissa de que o Max era
// o Claude e recusava muito. A premissa caducou no mesmo dia: o Max virou
// deepseek-v4.1-flash-1017-uncensored-thinking no OpenUncensored — já é sem censura. O que
// sobrou de problema real é outro, e é o que este arquivo resolve:
//
//   1) O Max é modelo de RACIOCÍNIO: pensa 20–40 s e gasta muitos tokens antes de escrever.
//      Em cena adulta, exploit pronto e relato de gore o raciocínio não agrega — o Rapid
//      entrega o mesmo em segundos, no mesmo balde de uso justo. Então pedido curto e
//      sabidamente "sem raciocínio" não passa pelo Max.
//   2) Quando o modelo escolhido RECUSA, o FORÇA TUDO repetia o MESMO modelo até 3 vezes. Se
//      ele não entrega por vocação, repetir queima rodada e às vezes volta vazia. Agora a 1ª
//      recusa já troca de modelo; só depois o modelo original tem 2ª chance.
//
// Nada aqui filtra conteúdo: o roteador só escolhe quem responde.

// Id público estável do modelo de raciocínio (o catálogo aponta para outro api_model desde
// 20/11 — por isso a decisão é pelo id, nunca pelo nome do fornecedor).
export const MAX_ID = 'claude-sonnet-5-5';
// Rápido, sem censura e no MESMO balde de uso justo do Max: destino natural do desvio.
export const RAPID_ID = 'zai-org/glm-5.3-flash-uncensored';
// Mais forte dos abertos. Fica no balde de créditos — só entra quando há crédito sobrando.
export const TITAN_ID = 'nousresearch/hermes-4-405b';
// Reservas sem crédito, do melhor para o pior.
const RESERVES = [RAPID_ID, 'sao10k/l3.1-euryale-70b', 'cognitivecomputations/dolphin-mistral-24b-venice-edition'];

// Baldes de assunto que NÃO ganham nada com raciocínio. Cada balde vale 1 ponto no máximo:
// pedido que só cita "site" e "link" não vira dois gatilhos.
const BALDES = [
  // Adulto / erótico
  /\b(sexo|sexual|er[oó]tic\w*|nsfw|porn[oô]\w*|nudez|pelad\w*|transa|gemid\w*|orgasm\w*|masturb\w*|fetiche|tes[ãa]o|boquete|penetra[çc][ãa]o)\b/i,
  // Gore / violência gráfica
  /\b(gore|mutila[çc][ãa]o|decapita\w*|esquarteja\w*|desmembra\w*|sangue jorrando|tortura (gr[aá]fic|detalha\w*)|vísceras?)\b/i,
  // Exploit / payload pronto
  /\b(exploit|payload|\bxss\b|\bsqli\b|sqlmap|mimikatz|meterpreter|reverse shell|shell reverso|\bcve-\d|buffer overflow|privesc|escala[çc][ãa]o de privil[ée]gio)\b/i,
  // Receita / algoritmo curto e fechado
  /\b(receita de|como fazer|passo a passo|algoritmo de|fun[çc][ãa]o que|regex para|comando (para|do))\b/i,
];

// O que puxa raciocínio de verdade: pergunta longa, comparação, depuração, arquitetura,
// análise, "por que". Isso segura o pedido no Max mesmo que ele case com um balde acima.
const PEDE_RACIOCINIO = /\b(por que|porque|explica\w*|explic\w*|compara\w*|diferen[çc]a|arquitetura|refator\w*|depura\w*|debug\w*|analis\w*|estrat[ée]gia|trade-?off|vale a pena|pr[óo]s e contras|melhor (forma|maneira|abordagem)|otimiz\w*)\b/i;

/** O pedido é do tipo que o Max só encarece (raciocínio não agrega)? Heurística local, custo zero. */
export function looksLight(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.length > 700) return false;             // pedido longo quase sempre tem o que raciocinar
  if (PEDE_RACIOCINIO.test(t)) return false;    // pediu análise/comparação: fica no Max
  return BALDES.some((re) => re.test(t));
}

/**
 * Decide o modelo efetivo antes da chamada.
 * @param {object} o
 * @param {string} o.userText   última mensagem do usuário
 * @param {string} o.requestedId modelo escolhido no seletor
 * @param {boolean} o.overBudget true quando o uso justo do balde 'pro' já estourou
 * @param {boolean} o.hasCredits true quando há crédito para modelo de créditos
 * @returns {{ modelId: string, rerouted: boolean, reason?: string }}
 */
export function routeFor({ userText, requestedId, overBudget = false, hasCredits = false, hasTools = false, keepMax = false }) {
  // Uso justo estourado: o app já troca para o Rapid (FAIR_USE_MODEL); o roteador não mexe.
  if (overBudget) return { modelId: requestedId, rerouted: false };
  // Só o Max tem o problema de latência; nos outros o roteador é inerte.
  if (requestedId !== MAX_ID) return { modelId: requestedId, rerouted: false };
  // Com ferramentas (agente/API) vale o raciocínio: o modelo precisa planejar a chamada.
  if (hasTools) return { modelId: requestedId, rerouted: false };
  // Modo qualidade/arena existe para comparar o melhor: não rebaixa para o rápido.
  if (keepMax) return { modelId: requestedId, rerouted: false };
  if (!looksLight(userText)) return { modelId: requestedId, rerouted: false };
  return {
    modelId: RAPID_ID,
    rerouted: true,
    reason: 'Pedido direto: o modelo rápido responde sem o tempo de raciocínio do Max.',
  };
}

/**
 * Para onde escalar quando `currentId` recusou.
 * Regra: nunca repete o modelo que acabou de recusar; nunca cai em modelo de créditos sem crédito.
 * A escalada é uma rodada só, então vale a melhor chance: com crédito vai no mais forte (Titan),
 * sem crédito no melhor sem custo (Rapid).
 * @returns {string|null} id do próximo modelo, ou null se não há para onde ir
 */
export function alternateFor(currentId, { hasCredits = false } = {}) {
  const order = hasCredits ? [TITAN_ID, ...RESERVES] : RESERVES;
  return order.find((id) => id !== currentId) || null;
}
