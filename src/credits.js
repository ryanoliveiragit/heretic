// Créditos — a moeda dos modelos de ponta (451 Hermes e 451 Kimi), no estilo da Venice:
// a assinatura dá mensagens ilimitadas nos modelos 451 baratos; os caros saem de créditos.
//
// 1 crédito = R$ 0,01. Cada resposta custa o custo real do provedor (US$) × câmbio × margem,
// arredondado para cima, mínimo 1 crédito. Assim o crédito nunca dá prejuízo, seja qual for o uso.
//
// Duas carteiras por assinante (sujeito = hash da chave Pro):
//   • plano: cota do mês (Pro 500, Pro Plus 13.000). No Pro não acumula; no Pro Plus acumula até
//     2 meses (teto = 2 × cota). É gasta primeiro.
//   • extra: créditos comprados avulsos (recarga). Não vencem.
// Guarda no mesmo Upstash Redis dos limites; sem Redis, na memória (só serve para teste local).

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const hasRedis = () => !!(REST_URL && REST_TOKEN);

export const CREDIT_BRL = 0.01;
const FX = Number(process.env.CREDIT_FX_BRL) || 5.80;       // R$ por US$ (20/11: dólar a R$ 5,77)
const MARKUP = Number(process.env.CREDIT_MARKUP) || 2;       // preço = 2× o custo real
export const MIN_TO_START = 3;                                // saldo mínimo para começar uma resposta

export const MONTHLY_GRANT = { free: 0, pro: 500, plus: 13000 };
const BANK_MONTHS = { free: 0, pro: 1, plus: 2 };

const mem = new Map();
const month = () => new Date().toISOString().slice(0, 7);
const k = (kind, sid) => `heretic:credits:${kind}:${sid}`;

async function pipeline(commands) {
  const res = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`credits store ${res.status}`);
  const rows = await res.json();
  return rows.map((row) => { if (row.error) throw new Error(row.error); return row.result; });
}

async function run(commands) {
  if (hasRedis()) {
    try { return await pipeline(commands); } catch (e) { console.error('[créditos] redis falhou, usando memória:', e.message); }
  }
  return commands.map(([cmd, key, a, ...rest]) => {
    const cur = mem.get(key);
    if (cmd === 'GET') return cur ?? null;
    if (cmd === 'SET') {
      if (rest.includes('NX') && cur != null) return null;
      mem.set(key, String(a)); return 'OK';
    }
    if (cmd === 'INCRBY') { const v = (Number(cur) || 0) + Number(a); mem.set(key, String(v)); return v; }
    if (cmd === 'DECRBY') { const v = (Number(cur) || 0) - Number(a); mem.set(key, String(v)); return v; }
    return null;
  });
}

/** Preço em créditos de uma resposta que custou `usd` no provedor. */
export function priceCredits(usd) {
  const v = Number(usd) || 0;
  if (v <= 0) return 1;
  return Math.max(1, Math.ceil(v * FX * MARKUP / CREDIT_BRL));
}

/** Dá a cota do mês uma vez por mês (na primeira consulta do mês). */
async function ensureGrant(sid, tier) {
  const grant = MONTHLY_GRANT[tier] || 0;
  if (!grant) return;
  const [isNew] = await run([['SET', k(`grant:${month()}`, sid), '1', 'EX', String(40 * 86400), 'NX']]);
  if (isNew !== 'OK') return;
  const [cur] = await run([['GET', k('plan', sid)]]);
  const cap = grant * (BANK_MONTHS[tier] || 1);
  const next = Math.min(Math.max(0, Number(cur) || 0) + grant, cap);
  await run([['SET', k('plan', sid), String(next)]]);
}

/** Saldo atual: { plan, extra, total, monthly }. */
export async function creditBalance(sid, tier) {
  await ensureGrant(sid, tier);
  const [p, e] = await run([['GET', k('plan', sid)], ['GET', k('extra', sid)]]);
  const plan = Math.max(0, Number(p) || 0), extra = Number(e) || 0;
  return { plan, extra, total: plan + extra, monthly: MONTHLY_GRANT[tier] || 0, unitBRL: CREDIT_BRL };
}

/** Desconta `n` créditos: primeiro a cota do plano, depois os avulsos. Devolve o saldo novo. */
export async function spendCredits(sid, tier, n) {
  const amount = Math.max(0, Math.ceil(Number(n) || 0));
  if (!amount) return creditBalance(sid, tier);
  const [p] = await run([['GET', k('plan', sid)]]);
  const fromPlan = Math.min(Math.max(0, Number(p) || 0), amount);
  const rest = amount - fromPlan;
  const cmds = [];
  if (fromPlan) cmds.push(['DECRBY', k('plan', sid), String(fromPlan)]);
  if (rest) cmds.push(['DECRBY', k('extra', sid), String(rest)]);
  await run(cmds);
  return creditBalance(sid, tier);
}

/** Recarga avulsa (admin hoje; webhook de pagamento depois). */
export async function addExtraCredits(sid, n) {
  const amount = Math.floor(Number(n) || 0);
  if (!amount) return null;
  const [v] = await run([['INCRBY', k('extra', sid), String(amount)]]);
  return Number(v) || 0;
}

// ── freio de velocidade ──
// "Ilimitado" com uso justo: uma mensagem a cada THROTTLE_SECONDS por pessoa. Segura robô e
// abuso sem que quem conversa normalmente (cada resposta leva ~9 s) chegue a perceber.
export const THROTTLE_SECONDS = Number(process.env.THROTTLE_SECONDS) || 8;
// QA 20/11: o Rapid responde em ~1 s; com 8 s, assinante que mandava a próxima logo levava "Calma".
// Pro/Plus: 3 s (ainda segura robô); Grátis segue 8 s.
export const THROTTLE_PRO_SECONDS = Number(process.env.THROTTLE_PRO_SECONDS) || 3;
const throttleMem = new Map();
export async function throttle(sid, seconds = THROTTLE_SECONDS) {
  const key = `heretic:throttle:${sid}`;
  if (hasRedis()) {
    try {
      const [ok] = await pipeline([['SET', key, '1', 'EX', String(seconds), 'NX']]);
      return ok === 'OK';
    } catch (e) { console.error('[freio] redis falhou, usando memória:', e.message); }
  }
  const until = throttleMem.get(key) || 0;
  if (until > Date.now()) return false;
  throttleMem.set(key, Date.now() + seconds * 1000);
  return true;
}
