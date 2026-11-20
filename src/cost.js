// Custo real do OpenUncensored — teto mensal e disjuntor de saldo.
// Edge: usa o mesmo Upstash Redis de limits.js; sem Redis, guarda na memória do processo.
// O custo vem do próprio provedor (ou.cost_usd no stream / usage no Anthropic-compatível).

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const hasRedis = () => !!(REST_URL && REST_TOKEN);

const mem = new Map();
const monthKey = () => `ou:cost:${new Date().toISOString().slice(0, 7)}`;
const dayKey = () => `ou:cost:${new Date().toISOString().slice(0, 10)}`;

async function pipeline(commands) {
  const res = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`cost store ${res.status}`);
  const rows = await res.json();
  return rows.map((row) => { if (row.error) throw new Error(row.error); return row.result; });
}

/** Soma o custo do turno no mês e no dia. */
export async function recordCost(usd) {
  const v = Number(usd) || 0;
  if (!v) return;
  if (hasRedis()) {
    try {
      await pipeline([['INCRBYFLOAT', monthKey(), String(v)], ['INCRBYFLOAT', dayKey(), String(v)]]);
      return;
    } catch (e) { console.error('[custo] redis falhou, usando memória:', e.message); }
  }
  mem.set(monthKey(), (mem.get(monthKey()) || 0) + v);
  mem.set(dayKey(), (mem.get(dayKey()) || 0) + v);
}

export async function monthlySpent() {
  if (hasRedis()) {
    try {
      const out = await pipeline([['GET', monthKey()]]);
      return Number(out[0]) || 0;
    } catch (e) { console.error('[custo] redis falhou, usando memória:', e.message); }
  }
  return mem.get(monthKey()) || 0;
}

// Saldo da chave OpenUncensored: uma checagem por hora (custa zero e evita bater na API a cada chat).
let _balance = { at: 0, usd: null };
async function remainingBalance() {
  const hour = 3600 * 1000;
  if (Date.now() - _balance.at < hour) return _balance.usd;
  const key = process.env.OU_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.openuncensored.com/v1/credits', { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return _balance.usd;
    const j = await res.json();
    _balance = { at: Date.now(), usd: Number(j.remaining_usd ?? j.balance_usd) };
    return _balance.usd;
  } catch { return _balance.usd; }
}

/**
 * Antes de despachar: o mês já passou do teto? O saldo da chave acabou?
 * ok=false com reason 'monthly_budget' ou 'ou_balance'.
 */
export async function checkGlobalBudget() {
  const budget = Number(process.env.MONTHLY_BUDGET_USD || 25);
  const spent = await monthlySpent();
  if (spent >= budget) return { ok: false, reason: 'monthly_budget', spent, budget };
  const min = Number(process.env.OU_MIN_BALANCE_USD || 1);
  const balance = await remainingBalance();
  if (balance != null && balance < min) return { ok: false, reason: 'ou_balance', balance, min };
  return { ok: true, spent, budget, balance };
}
