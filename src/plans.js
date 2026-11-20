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
export const FREE_MODEL = 'sao10k/l3.1-euryale-70b';
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
    id: 'sao10k/l3.1-euryale-70b', name: '451 Free', short: '451 Free', note: 'Sem censura, direto e rápido', tier: 'free', quality: 3,
    guide: {
      role: 'O modelo do plano grátis: sem censura e direto ao ponto.',
      bestFor: 'Conversa do dia a dia, perguntas rápidas e decisões sem enrolação.',
      style: 'Testado em 18/11: resposta concisa em prosa corrida, 13 s, cerca de 1,5 mil caracteres, sem recusa.',
      limits: [
        'Responde curto por padrão: para tutorial longo, peça "passo a passo completo".',
        'Aceita arquivo de texto. Imagem e PDF são dos modelos Pro.',
        'Não roda comandos. Conversa muito longa mantém só as últimas 8 mensagens.',
      ],
      fallback: 'Se o provedor falhar, o servidor troca de modelo sozinho e a conversa continua.',
      tested: 'Testado em 18/11/2026.',
    },
  },
  // Pro = DOIS modelos de topo pra comparar (dono 17/11), ambos sem censura:
  //  • Heretic Titan = a melhor aberta do OpenRouter (Hermes 405B).
  //  • Heretic Max = cérebro de nuvem Claude (estilo Drael), com camada anti-recusa.
  {
    id: 'nousresearch/hermes-4-405b', name: '451 Titan', short: '451 Titan', note: 'Melhor modelo aberto sem censura (Hermes 405B, OpenRouter)', tier: 'pro', quality: 4,
    guide: {
      role: 'O melhor modelo aberto sem censura do catálogo (405B).',
      bestFor: 'Problema difícil, análise longa e técnica de verdade.',
      style: 'Testado hoje: resposta densa em seções numeradas com passos em negrito — 24 s (o mais lento dos testes), ~3 mil caracteres, sem recusa.',
      limits: [
        'O mais lento dos testes de 18/11.',
        'Lê imagem e PDF por um leitor auxiliar, que transcreve o arquivo antes da resposta. PDF só com imagem escaneada pode não ser lido.',
        'Não roda comandos. Conversa longa mantém as últimas 8 mensagens.',
      ],
      fallback: 'Se o provedor falhar, o servidor troca para o 451 Free. Também é a reserva do FORÇA TUDO: se outro modelo recusar tudo, ele assume.',
      tested: 'Testado em 18/11/2026 (com plano Pro no ambiente de teste).',
    },
  },
  // Heretic Max — cérebro de nuvem (Claude). Só aparece quando a chave CLAUDE_KEY está no ambiente.
  {
    id: 'claude-sonnet-5-5', name: '451 Max', short: '451 Max', note: 'Nível Claude — lê contexto e ferramentas sem alucinar (nuvem)', tier: 'pro', quality: 4,
    guide: {
      role: 'O cérebro de nuvem: nível Claude Opus, lê contexto e busca sem alucinar.',
      bestFor: 'Pesquisa de pessoa com ficha, fontes e fotos; análise que não pode errar.',
      style: 'Verificado em produção: dossiê com fontes reais, galeria de fotos e passos; teto de saída ≥ 8k tokens (respostas longas sem cortar).',
      limits: [
        'É o modelo com os limites de uso mais curtos, porque cada resposta custa bem mais que nos outros.',
        'Lê imagem e PDF de até 30 páginas direto, sem leitor auxiliar.',
        'Resposta não é streaming de verdade: o primeiro pedaço pode demorar; o app mostra etapas reais ("buscando", "lendo fontes") enquanto espera.',
        'Se o cérebro de nuvem recusar tudo, o servidor cai para o 451 Titan.',
      ],
      fallback: 'Cai para o 451 Titan quando o cérebro de nuvem falha ou recusa.',
      tested: 'Verificado em produção (busca web, ficha e fotos). Teste local não se aplica: a chave fica só no ambiente de produção.',
    },
  },
];

// Heretic Max (cérebro de nuvem) só entra no catálogo público se a chave existir.
const HAS_ANTHROPIC = !!(process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY);
export const PUBLIC_MODELS = PUBLIC_MODELS_RAW.filter(raw => raw.id !== 'claude-sonnet-5-5' || HAS_ANTHROPIC).map(raw => {
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

const fixedCodes = () => (process.env.ACCESS_CODES || '')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

// ── chaves Pro pagas (Pix ou cripto, dono 18/11) ──
// Formato: 451-PRO-<validade em base36>-<pedido>-<assinatura>. A assinatura é HMAC-SHA256 com
// ACCESS_SECRET sobre "pro|validade|pedido", então a chave vale sem banco em qualquer instância Edge
// e ninguém fabrica uma sem o segredo. Sem ACCESS_SECRET no ambiente não existe chave paga
// (o segredo padrão só vale no modo de pagamento simulado, para teste local).
const PAID_RE = /^451-PRO-([0-9A-Z]{6,10})-([0-9A-Z]{6,40})-([0-9A-F]{24})$/;
const paidSecret = () => process.env.ACCESS_SECRET || (process.env.PAY_MODE === 'mock' ? 'heretic-dev-secret-2026' : '');

async function hmacHex(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Chave Pro paga, válida até expiresAt (ms). orderId: só letras e números. */
export async function issuePaidKey(orderId, expiresAt) {
  const secret = paidSecret();
  if (!secret) throw new Error('ACCESS_SECRET ausente: chave paga desativada');
  const exp = Math.floor(expiresAt / 1000).toString(36).toUpperCase();
  const id = String(orderId).toUpperCase().replace(/[^0-9A-Z]/g, '');
  const sig = (await hmacHex(secret, `pro|${exp}|${id}`)).slice(0, 24);
  return `451-PRO-${exp}-${id}-${sig}`;
}

/** Validade de uma chave paga (ms) se a assinatura confere, ou null. Não olha se já venceu. */
export async function paidKeyExpiry(key) {
  const secret = paidSecret();
  const m = PAID_RE.exec(String(key || '').trim().toUpperCase());
  if (!secret || !m) return null;
  const sig = (await hmacHex(secret, `pro|${m[1]}|${m[2]}`)).slice(0, 24);
  if (sig !== m[3]) return null;
  return parseInt(m[1], 36) * 1000;
}

/** Plan granted by a code, or null if the code is invalid. */
export function planForKey(key) {
  if (!key) return null;
  const k = String(key).trim().toUpperCase();
  // Códigos fixos da allowlist (env ACCESS_CODES), como o do dono. Chave paga: planForKeyAsync.
  if (fixedCodes().includes(k)) return 'pro';
  return null;
}

/** Igual ao planForKey, aceitando também a chave paga dentro da validade. */
export async function planForKeyAsync(key) {
  if (planForKey(key)) return 'pro';
  const exp = await paidKeyExpiry(key);
  return exp && exp > Date.now() ? 'pro' : null;
}

/** Access key sent by the app: x-451-key header (rebrand 451) or the old x-heretic-key, else the cookie.
 *  19/11: o app passou a mandar x-451-key e o servidor só lia x-heretic-key — a chave Pro paga era ignorada. */
export function keyFrom(c) {
  const h = c.req.header('x-451-key') || c.req.header('x-heretic-key');
  if (h) return h;
  const cookie = c.req.header('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)(?:451_key|heretic_key)=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export async function planOf(c) {
  // HERETIC_PLAN=pro (env) forces Pro for everyone — local testing / global switch.
  if (process.env.HERETIC_PLAN === 'pro') return 'pro';
  // Otherwise: free by default, Pro when a valid access code (fixo ou pago e dentro da validade) is present.
  return c && (await planForKeyAsync(keyFrom(c))) === 'pro' ? 'pro' : 'free';
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
