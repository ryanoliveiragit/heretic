// Plans, models and the free daily token budget.
// Free users get one model and FREE_DAILY_TOKENS per day (UTC); Pro models are listed but locked.
// Usage is counted per visitor (IP, falling back to the client id header). It is stored in
// Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN (or Vercel KV_REST_API_URL/TOKEN) are set;
// otherwise in memory, which on Vercel Edge is per instance and resets — good for a demo, not a hard limit.

// Padrão grátis = Gemma 4 Uncensored (Venice): Google Gemma rende melhor em pt-BR e em seguir
// instrução, é mais barato que os antigos grátis e roda na Venice (chave ativa). O Venice UC 1.2
// e o Dolphin seguem como opções grátis.
// Padrão grátis = Heretic Rapid (GLM 5.3): nos testes rendeu respostas mais inteligentes, longas e
// estáveis (sem loop) que o Gemma, pelo MESMO preço ($0,020/100). Gemma/Venice UC/Dolphin seguem grátis.
// Grade estilo Venice (dono 19/11): o grátis usa o 451 Titan, 15 mensagens por dia. O id antigo do
// "451 Free" (sao10k/...) continua aceito e vira o Titan, para quem tem o modelo salvo no aparelho.
export const FREE_MODEL = 'nousresearch/hermes-4-405b';
export const LEGACY_FREE_MODEL = 'sao10k/l3.1-euryale-70b';
// Pro e Pro Plus: ilimitado nestes (uso justo); acima do teto diário a conversa segue no Rapid.
export const UNLIMITED_MODELS = ['zai-org/glm-5.3-flash-uncensored', 'nousresearch/hermes-4-405b', 'claude-sonnet-5-5', LEGACY_FREE_MODEL];
export const FAIR_USE_MODEL = 'zai-org/glm-5.3-flash-uncensored';
// Modelos de ponta: só com créditos (nunca no ilimitado).
export const CREDIT_MODELS = ['hermes-4-405b', 'kimi-k3.1-pro-uncensored'];
export const FREE_DAILY_TOKENS = Number(process.env.FREE_DAILY_TOKENS) || 20000;

import { MODEL_CATALOG } from './upstream.js';

// What the chat shows: uncensored models only, from OpenRouter and Venice alike, all served
// through our proxy (src/upstream.js), which adds the anti-refusal layer. If a provider can't
// answer, the proxy reroutes to the other one instead of failing.
// Prices verified live on 2026-11-15 (openrouter.ai/api/v1/models + venice.ai/models); they are
// USD per million tokens and can drift — refresh them before changing tiers.
const CATALOG = Object.fromEntries(MODEL_CATALOG.map(m => [m.id, m]));

/** Rough cost of ~100 short exchanges (≈ 30k in + 30k out tokens), in USD. */
export function costPer100(m) {
  if (!m || !isFinite(m.price_in) || !isFinite(m.price_out)) return null;
  return 0.03 * (m.price_in + m.price_out);
}

export const PUBLIC_MODELS_RAW = [
  // Catálogo ENXUTO — só os melhores custo-benefício (nomes de marca Heretic; ids de terceiros escondidos).
  // Dono (16/11): cortado de 14 p/ 4 — "não adianta ter vários e ruins".
  // Ordem = pior → melhor (dono 17/11). quality: 1=Baixo, 2=Médio, 3=Alto, 4=Máximo (mostrado no seletor no lugar do custo).
  // guide = a aba "Modelos" das Configurações. Texto honesto: nada prometido que o código não faça
  // (tools/server), limites medidos no teste de 18/11 (mesma pergunta de defesa SSH, sem recusa em nenhum).
  // Grátis = UM modelo só (dono 18/11): o melhor dos três. Dolphin e Cydonia ficam de reserva
  // invisível no servidor (FREE_RESERVES em upstream.js), sem opção de seleção.
  {
    id: 'sao10k/l3.1-euryale-70b', name: '451 Free', short: '451 Free', note: 'DeepSeek V4.1 Flash Heretic sem censura (OpenUncensored)', tier: 'free', quality: 3,
    guide: {
      role: 'O modelo do plano grátis: sem censura, direto e estável.',
      bestFor: 'Conversa do dia a dia, perguntas rápidas e decisões sem enrolação.',
      style: 'Testado em 19/11: resposta direta em prosa, 9 s, 2–3 mil caracteres, sem recusa.',
      limits: [
        'Responde direto; para tutorial longo, peça "passo a passo completo".',
        'Aceita arquivo de texto. Imagem e PDF são dos modelos Pro.',
        'Não roda comandos. Conversa muito longa mantém só as últimas 8 mensagens.',
      ],
      fallback: 'Se o provedor falhar, o servidor troca de modelo sozinho e a conversa continua.',
      tested: 'Testado em 19/11/2026.',
    },
  },
  {
    id: 'zai-org/glm-5.3-flash-uncensored', name: '451 Rapid', short: '451 Rapid', note: 'GLM 5.3 Flash sem censura (OpenUncensored)', tier: 'pro', quality: 3,
    guide: {
      role: 'Rápido e sem censura: responde primeiro com o Claude Sonnet; se ele recusar, um modelo sem censura entrega.',
      bestFor: 'Conversa longa, resumo, ideia rápida e tarefa do dia a dia.',
      style: 'Medido em 21/11 com o Claude Sonnet na frente: ~2 s numa pergunta curta e ~11 s numa explicação de 3 parágrafos.',
      limits: [
        'Para raciocínio profundo, use o Max.',
        'Lê imagem e PDF por um leitor auxiliar.',
        'Não roda comandos. Conversa longa mantém as últimas 8 mensagens.',
      ],
      fallback: 'Se o Claude recusar ou falhar, um modelo sem censura assume e a conversa continua.',
      tested: 'Medido em 21/11/2026.',
    },
  },
  // Pro = DOIS modelos de topo pra comparar (dono 17/11), ambos sem censura:
  //  • Heretic Titan = a melhor aberta do OpenRouter (Hermes 405B).
  //  • Heretic Max = cérebro de nuvem Claude (estilo Drael), com camada anti-recusa.
  {
    id: 'nousresearch/hermes-4-405b', name: '451 Titan', short: '451 Titan', note: 'DeepSeek V4.1 Flash sem censura (OpenUncensored)', tier: 'free', quality: 4,
    guide: {
      role: 'O modelo do grátis e o cavalo de batalha do Pro: responde primeiro com o Claude Sonnet; se ele recusar, um modelo sem censura forte entrega.',
      bestFor: 'Conversa do dia a dia, análise, técnica e decisões sem enrolação.',
      style: 'Medido em 21/11 com o Claude Sonnet na frente: ~2 s numa pergunta curta e ~11 s numa explicação de 3 parágrafos.',
      limits: [
        'No grátis: 15 mensagens por dia. No Pro: ilimitado, com uso justo.',
        'Imagem e PDF só no Pro (leitor auxiliar transcreve o arquivo antes da resposta).',
        'Não roda comandos. Conversa longa mantém as últimas mensagens.',
      ],
      fallback: 'Se o Claude recusar ou falhar, um modelo sem censura assume e a conversa continua.',
      tested: 'Medido em 21/11/2026.',
    },
  },
  // Heretic Max — cérebro de nuvem (Claude). Só aparece quando a chave CLAUDE_KEY está no ambiente.
  {
    id: 'claude-sonnet-5-5', name: '451 Max', short: '451 Max', note: 'Claude Opus 5.5 na Anthropic, com camada anti-recusa', tier: 'pro', quality: 4,
    guide: {
      role: 'Raciocínio profundo: pensa antes de responder, lê contexto e busca na web. É o Claude com a camada anti-recusa do 451 por cima.',
      bestFor: 'Pesquisa de pessoa com ficha, fontes e fotos; análise longa e código que não pode errar.',
      style: 'Verificado em produção: dossiê com fontes reais, galeria de fotos e passos; teto de saída ≥ 8k tokens (respostas longas sem cortar).',
      limits: [
        'É o modelo mais caro por token, porque cada resposta custa bem mais que nos outros.',
        'Lê imagem e PDF de até 30 páginas direto, sem leitor auxiliar.',
        'Nível de raciocínio baixo/médio/alto muda a profundidade e o tempo: baixo responde rápido, alto pensa muito antes.',
        'Se o Claude recusar, o servidor troca de modelo sozinho em vez de devolver a recusa.',
      ],
      fallback: 'Se o Claude recusar, quem entrega é o 451 Rapid, sem censura. Se ele falhar, o servidor troca de modelo sozinho.',
      tested: 'Verificado em produção em 20/11 (busca web, ficha, fotos e teto de saída).',
    },
  },
  {
    id: 'hermes-4-405b', name: '451 Hermes', short: '451 Hermes', note: 'Hermes 4 405B sem censura (OpenUncensored)', tier: 'pro', quality: 4,
    guide: {
      role: 'O aberto mais forte do catálogo: 405B, sem censura, para o problema difícil.',
      bestFor: 'Análise longa, texto denso e raciocínio técnico de verdade.',
      style: 'Testado em 19/11: resposta densa e completa, sem recusa.',
      limits: [
        'Modelo de ponta: usa créditos (Pro traz 500 por mês, Pro Plus 13.000). Não entra no ilimitado.',
        'Lê imagem e PDF por um leitor auxiliar.',
        'Não roda comandos. Conversa longa mantém as últimas 8 mensagens.',
      ],
      fallback: 'Se o provedor falhar, cai para o 451 Titan.',
      tested: 'Testado em 19/11/2026.',
    },
  },
  {
    id: 'kimi-k3.1-pro-uncensored', name: '451 Kimi', short: '451 Kimi', note: 'Kimi K3.1 Pro sem censura (OpenUncensored)', tier: 'pro', quality: 4,
    guide: {
      role: 'O mais certeiro do catálogo: raciocínio forte, sem censura, para o que não pode errar.',
      bestFor: 'Pesquisa, análise difícil e resposta que precisa acertar de primeira.',
      style: 'Testado em 19/11: resposta precisa e bem estruturada, sem recusa.',
      limits: [
        'Modelo de ponta: usa créditos (Pro traz 500 por mês, Pro Plus 13.000). Não entra no ilimitado.',
        'Lê imagem e PDF por um leitor auxiliar.',
        'Não roda comandos. Conversa longa mantém as últimas 8 mensagens.',
      ],
      fallback: 'Se o provedor falhar, cai para o 451 Max.',
      tested: 'Testado em 19/11/2026.',
    },
  },
];

// Heretic Max é o Claude de verdade: só entra no catálogo público se houver chave da Anthropic.
const HAS_MAX = !!(process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY);
export const PUBLIC_MODELS = PUBLIC_MODELS_RAW.filter(raw => raw.id !== LEGACY_FREE_MODEL).filter(raw => raw.id !== 'claude-sonnet-5-5' || HAS_MAX).map(raw => {
  const m = CATALOG[raw.id];
  return { ...raw, provider: m?.provider || null, price_in: m?.price_in ?? null, price_out: m?.price_out ?? null, ctx: m?.ctx ?? null, cost100: m ? costPer100(m) : null };
});

// ── access codes ──
// Free is public (no code needed). A valid access code unlocks Pro (all models).
// Two kinds of valid code, both checked without any database:
//   1) fixed codes listed in ACCESS_CODES (comma-separated) — e.g. the owner's MAX code;
//   2) signed codes "HRTC-PRO-<serial>-<sig>" issued by /api/checkout, where <sig> is derived
//      from ACCESS_SECRET + serial, so they validate statelessly on any Edge instance.
// This is the "por enquanto" flow; swap for Stripe + a real key store when billing lands.
const ACCESS_SECRET = process.env.ACCESS_SECRET || 'heretic-dev-secret-2026';

function codeSig(serial) {
  let h1 = 0x811c9dc5 >>> 0, h2 = 0x01000193 >>> 0;
  const s = `${ACCESS_SECRET}|${serial}`;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2654435761) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8).padEnd(8, '0');
}

/** Make a fresh signed Pro code (used by the buy/checkout stub). */
export function issueCode() {
  const serial = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase().slice(-7);
  return `HRTC-PRO-${serial}-${codeSig(serial)}`;
}

// ── chaves pagas, assinadas e com validade ──
// Formato: 451-<PRO|PLUS>-<validade em segundos base36>-<assinatura>. Validam sem banco em qualquer
// instância (igual aos códigos do dono), mas trazem a validade embutida: quando passa, viram grátis.
// A assinatura é um hash com chave (ACCESS_SECRET) sobre "plano|validade" — sem o segredo não dá pra forjar.
function paidSig(payload) {
  const salts = ['A9', 'C7', 'E3', 'B5'];
  let out = '';
  for (const salt of salts) {
    let h = 0x811c9dc5 >>> 0;
    const s = `${ACCESS_SECRET}|${salt}|${payload}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    out += h.toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padStart(4, '0');
  }
  return out; // 16 chars base36
}

/** Gera uma chave paga: plano 'pro'|'plus', validade em ms epoch. */
export function issuePaidKey(plan, expiresAtMs) {
  const p = plan === 'plus' ? 'PLUS' : 'PRO';
  const expSec = Math.floor(expiresAtMs / 1000).toString(36).toUpperCase();
  return `451-${p}-${expSec}-${paidSig(`${p}|${expSec}`)}`;
}

/** Valida uma chave paga: devolve { plan, expiresAt } se a assinatura bate e não venceu; senão null. */
export function verifyPaidKey(key) {
  const m = String(key || '').trim().toUpperCase().match(/^451-(PRO|PLUS)-([0-9A-Z]+)-([0-9A-Z]{16})$/);
  if (!m) return null;
  const [, p, expSec, sig] = m;
  if (paidSig(`${p}|${expSec}`) !== sig) return null;
  const expiresAt = parseInt(expSec, 36) * 1000;
  if (!isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { plan: p === 'PLUS' ? 'plus' : 'pro', expiresAt };
}

const fixedCodes = () => (process.env.ACCESS_CODES || '')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const proCodes = () => (process.env.PRO_CODES || '')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const PLUS_CODES = () => (process.env.PLUS_CODES || '')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
// Conta de administrador (dono 20/11): env ADMIN_CODES. Vale como Pro Plus, não vence e não tem
// freio, teto de gasto, uso justo nem cota (mensagens, imagens, anexos). Créditos seguem a carteira.
const adminCodes = () => (process.env.ADMIN_CODES || '')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
export function isAdminKey(key) {
  const k = String(key || '').trim().toUpperCase();
  return !!k && adminCodes().includes(k);
}
export const isAdmin = (c) => !!c && isAdminKey(keyFrom(c));

/** Plan granted by a code, or null if the code is invalid. */
export function planForKey(key) {
  if (!key) return null;
  const k = String(key).trim().toUpperCase();
  // Pro é EXCLUSIVO do dono: só os códigos da allowlist (env ACCESS_CODES) dão Pro. Os códigos
  // auto-assinados (HRTC-...-sig) foram desativados — não há mais geração pública de chave.
  // ACCESS_CODES = códigos do dono → Pro Plus (tudo). PRO_CODES = assinantes Pro.
  if (adminCodes().includes(k)) return 'plus';
  if (fixedCodes().includes(k)) return 'plus';
  if (PLUS_CODES().includes(k)) return 'plus';
  if (proCodes().includes(k)) return 'pro';
  // Chaves pagas (assinadas, com validade): geradas pelo /api/pay quando o Pix/cripto confirma.
  const paid = verifyPaidKey(k);
  if (paid) return paid.plan;
  return null;
}

/** Chave do app: header x-451-key (novo) ou x-heretic-key (legado), senão cookie 451_key/heretic_key. */
export function keyFrom(c) {
  const h = c.req.header('x-451-key') || c.req.header('x-heretic-key');
  if (h) return h;
  const cookie = c.req.header('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)(?:451_key|heretic_key)=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/** Plano detalhado: 'free' | 'pro' | 'plus'. */
export function tierOf(c) {
  // FORCE_PLAN=pro|plus (env; legado: HERETIC_PLAN) força o plano para todos — teste local.
  const forced = process.env.FORCE_PLAN || process.env.HERETIC_PLAN;
  if (forced === 'pro' || forced === 'plus') return forced;
  return (c && planForKey(keyFrom(c))) || 'free';
}

/** Compatível com o app: qualquer plano pago aparece como 'pro'. O detalhe fica em tierOf. */
export function planOf(c) {
  return tierOf(c) === 'free' ? 'free' : 'pro';
}

export function modelsFor(plan) {
  return PUBLIC_MODELS.map(m => ({ ...m, locked: m.tier !== 'free' && plan !== 'pro' }));
}

export function canUse(plan, modelId) {
  const m = PUBLIC_MODELS.find(x => x.id === modelId);
  if (!m) return false;
  return m.tier === 'free' || plan === 'pro';
}

/** Modelo que atende o pedido. Id antigo salvo no aparelho (ou de reserva) vira o modelo grátis; Pro sem plano devolve null. */
export function resolveModel(plan, requested) {
  const m = PUBLIC_MODELS.find(x => x.id === requested);
  if (m && m.tier === 'pro') return plan === 'pro' ? m.id : null;
  return FREE_MODEL;
}

/** Rough token estimate (≈ 4 characters per token), used for the free budget. */
export function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

export function visitorId(c) {
  const fwd = c.req.header('x-forwarded-for') || '';
  const ip = fwd.split(',')[0].trim() || c.req.header('x-real-ip') || '';
  const cid = (c.req.header('x-451-client') || c.req.header('x-heretic-client') || '').slice(0, 64);
  return ip ? `ip:${ip}` : cid ? `cid:${cid}` : 'anon';
}

// Anti-burla: o usuário é contado por IP E por impressão de dispositivo (fingerprint). O limite
// bate se QUALQUER um dos dois estourar — então trocar só o IP (VPN) ou só o navegador (limpar cache)
// não zera; precisa trocar os DOIS (aparelho diferente). Retorna a lista de ids a cruzar.
export function visitorIds(c) {
  const fwd = c.req.header('x-forwarded-for') || '';
  const ip = (fwd.split(',')[0].trim() || c.req.header('x-real-ip') || '').trim();
  const fp = (c.req.header('x-451-client') || c.req.header('x-heretic-client') || '').slice(0, 48).replace(/[^a-zA-Z0-9]/g, '');
  const ids = [];
  if (ip) ids.push('ip:' + ip);
  if (fp) ids.push('fp:' + fp);
  if (!ids.length) ids.push('anon');
  return ids;
}
// Maior uso entre os ids (bloqueia se qualquer um já passou do limite).
export async function getUsedMax(ids, day = today()) {
  let max = 0;
  for (const id of ids) { const u = await getUsed(id, day); if (u > max) max = u; }
  return max;
}
// Debita em TODOS os ids e devolve o maior (o que conta pro limite).
export async function addUsedAll(ids, n, day = today()) {
  let max = 0;
  for (const id of ids) { const v = await addUsed(id, n, day); if (v > max) max = v; }
  return max;
}

export const today = () => new Date().toISOString().slice(0, 10);

// ── usage store ──
const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const mem = new Map();
const key = (id, day) => `heretic:usage:${day}:${id}`;

async function redis(path) {
  const res = await fetch(`${REST_URL}/${path}`, { headers: { Authorization: `Bearer ${REST_TOKEN}` } });
  if (!res.ok) throw new Error(`usage store ${res.status}`);
  return (await res.json()).result;
}

export async function getUsed(id, day = today()) {
  if (REST_URL && REST_TOKEN) {
    try { return Number(await redis(`get/${encodeURIComponent(key(id, day))}`)) || 0; } catch { /* fall back */ }
  }
  return mem.get(key(id, day)) || 0;
}

export async function addUsed(id, n, day = today()) {
  const k = key(id, day);
  if (REST_URL && REST_TOKEN) {
    try {
      const v = Number(await redis(`incrby/${encodeURIComponent(k)}/${Math.max(0, Math.round(n))}`));
      redis(`expire/${encodeURIComponent(k)}/172800`).catch(() => {});
      return v;
    } catch { /* fall back */ }
  }
  const v = (mem.get(k) || 0) + Math.max(0, Math.round(n));
  mem.set(k, v);
  return v;
}

export const usageStore = () => (REST_URL && REST_TOKEN ? 'redis' : 'memory');
