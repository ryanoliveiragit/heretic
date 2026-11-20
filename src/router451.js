// Roteador Claude ↔ modelo sem censura (branch homo-451, dono 20/11).
// Ideia: o 451 Max (Claude Opus) responde melhor que os modelos abertos em análise longa,
// código e pesquisa — mas recusa certos pedidos. Em vez de gastar tokens caros e descobrir
// a recusa DEPOIS (FORÇA TUDO re-roda tudo), um classificador barato decide ANTES da chamada:
//   • parece recusável → vai direto pro modelo sem censura que o usuário selecionou;
//   • parece seguro    → vai pro Claude; se mesmo assim recusar, o fallback já existente assume.
// Nada é censurado: o desvio existe só pra poupar custo e latência, não pra filtrar conteúdo.

// Gatilhos clássicos de recusa da Anthropic. Heurística local, custo zero, < 1 ms.
// Cada regex casa com pedido que historicamente faz o Opus recusar ou responder defensivo.
const REFUSAL_TRIGGERS = [
  // Adulto / sexual explícito
  /\b(sexo|sexual|er[oó]tic|nsfw|porn[oô]|nudez|pelad|transa|gemid\w*|orgasm\w*|masturb\w*|fetiche)\b/i,
  // Violência gráfica / gore detalhado
  /\b(gore|mutila[çc][ãa]o|decapit\w*|esquartej\w*|sangue jorrando|tortur\w* (gr[aá]fic|detalhad)|desmembr\w*)\b/i,
  // Hacking/pentest com payload realista (o Claude tende a suavizar ou pedir autorização)
  /\b(exploit|xss payload|\bsqli\b|sqlmap|payload de (inje[çc][ãa]o|xss)|como invadir|hackear|quebrar (a )?senha|mimikatz|meterpreter)\b/i,
  // Drogas, armas e ilegalidade concreta
  /\b(cozinha de metanfetamina|\bmetanfetamina\b|\bcocaína\b|\bmaconha\b|(comprar|fabricar) (arma|munição)|arma de fogo caseira)\b/i,
  // Política sensível com nome próprio / opinião forçada
  /\b(quem está certo|minha opinião sobre (lula|bolsonaro|trump)|é comunismo bom)\b/i,
];

export function looksRefusable(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  return REFUSAL_TRIGGERS.some((re) => re.test(t));
}

/**
 * Decide se a mensagem vai pro Claude ou pro modelo sem censura do usuário.
 * @param {string} userText      última mensagem do usuário
 * @param {string} requestedId   id do modelo no catálogo que o usuário escolheu
 * @param {boolean} hasAnthropicKey se há chave da Anthropic no ambiente
 * @returns {{ modelId: string, rerouted: boolean, reason?: string }}
 */
export function routeFor(userText, requestedId, hasAnthropicKey) {
  if (!hasAnthropicKey) return { modelId: requestedId, rerouted: false };
  if (requestedId !== 'claude-sonnet-5-5') return { modelId: requestedId, rerouted: false };
  if (!looksRefusable(userText)) return { modelId: requestedId, rerouted: false };
  return {
    modelId: 'nousresearch/hermes-4-405b', // Titan — melhor aberto sem censura do catálogo
    rerouted: true,
    reason: 'Pedido parece recusável ao cérebro de nuvem; desviado para o modelo sem censura.',
  };
}
