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
export const FREE_MODEL = 'cognitivecomputations/dolphin-mistral-24b-venice-edition';
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
  { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition', name: 'Heretic Free', short: 'Heretic Free', note: 'Uncensored, rápido e barato (Dolphin 24B)', tier: 'free', quality: 1 },
  { id: 'thedrummer/cydonia-24b-v4.1', name: 'Heretic Swift', short: 'Heretic Swift', note: 'Equilíbrio de velocidade e qualidade (Cydonia 24B)', tier: 'free', quality: 2 },
  { id: 'sao10k/l3.1-euryale-70b', name: 'Heretic Rapid', short: 'Heretic Rapid', note: 'Mais esperto, melhor custo (Euryale 70B)', tier: 'free', quality: 3 },
  { id: 'anthracite-org/magnum-v4-72b', name: 'Heretic Deep', short: 'Heretic Deep', note: 'Profundidade em problemas difíceis (Magnum 72B)', tier: 'pro', quality: 3 },
  { id: 'nousresearch/hermes-4-405b', name: 'Heretic Titan', short: 'Heretic Titan', note: 'Capacidade máxima (Hermes 405B)', tier: 'pro', quality: 4 },
];

export const PUBLIC_MODELS = PUBLIC_MODELS_RAW.map(raw => {
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

/** Plan granted by a code, or null if the code is invalid. */
export function planForKey(key) {
  if (!key) return null;
  const k = String(key).trim().toUpperCase();
  if (fixedCodes().includes(k)) return 'pro';
  const m = k.match(/^HRTC-(?:PRO|MAX|STD)-([A-Z0-9]+)-([A-Z0-9]+)$/);
  if (m && codeSig(m[1]) === m[2]) return 'pro';
  return null;
}

/** Access key sent by the app: x-heretic-key header, else the heretic_key cookie. */
export function keyFrom(c) {
  const h = c.req.header('x-heretic-key');
  if (h) return h;
  const cookie = c.req.header('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)heretic_key=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export function planOf(c) {
  // HERETIC_PLAN=pro (env) forces Pro for everyone — local testing / global switch.
  if (process.env.HERETIC_PLAN === 'pro') return 'pro';
  // Otherwise: free by default, Pro when a valid access code is present.
  return c && planForKey(keyFrom(c)) === 'pro' ? 'pro' : 'free';
}

export function modelsFor(plan) {
  return PUBLIC_MODELS.map(m => ({ ...m, locked: m.tier !== 'free' && plan !== 'pro' }));
}

export function canUse(plan, modelId) {
  const m = PUBLIC_MODELS.find(x => x.id === modelId);
  if (!m) return false;
  return m.tier === 'free' || plan === 'pro';
}

/** Rough token estimate (≈ 4 characters per token), used for the free budget. */
export function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

export function visitorId(c) {
  const fwd = c.req.header('x-forwarded-for') || '';
  const ip = fwd.split(',')[0].trim() || c.req.header('x-real-ip') || '';
  const cid = (c.req.header('x-heretic-client') || '').slice(0, 64);
  return ip ? `ip:${ip}` : cid ? `cid:${cid}` : 'anon';
}

// Anti-burla: o usuário é contado por IP E por impressão de dispositivo (fingerprint). O limite
// bate se QUALQUER um dos dois estourar — então trocar só o IP (VPN) ou só o navegador (limpar cache)
// não zera; precisa trocar os DOIS (aparelho diferente). Retorna a lista de ids a cruzar.
export function visitorIds(c) {
  const fwd = c.req.header('x-forwarded-for') || '';
  const ip = (fwd.split(',')[0].trim() || c.req.header('x-real-ip') || '').trim();
  const fp = (c.req.header('x-heretic-client') || '').slice(0, 48).replace(/[^a-zA-Z0-9]/g, '');
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
