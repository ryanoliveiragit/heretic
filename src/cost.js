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

// Freio do grátis (dono 21/11: o grátis passou a começar pelo Claude Sonnet). Soma o gasto do plano
// grátis no dia (UTC); passou de FREE_CLAUDE_DAY_USD, o grátis segue só nos sem censura (sem Claude)
// até o dia virar. Ajuste pela variável FREE_CLAUDE_DAY_USD na Vercel (vale a partir do próximo deploy).
const freeDayKey = () => `gratis:cost:${new Date().toISOString().slice(0, 10)}`;
export const freeClaudeDayUsd = () => Number(process.env.FREE_CLAUDE_DAY_USD || 3);
export async function recordFreeCost(usd) {
  const v = Number(usd) || 0;
  if (!v) return;
  if (hasRedis()) {
    try {
      await pipeline([['INCRBYFLOAT', freeDayKey(), String(v)], ['EXPIRE', freeDayKey(), '172800']]);
      return;
    } catch (e) { console.error('[custo] redis falhou, usando memória:', e.message); }
  }
  mem.set(freeDayKey(), (mem.get(freeDayKey()) || 0) + v);
}
/** O grátis ainda pode começar pelo Claude hoje? */
export async function freeClaudeOk() {
  let gasto = mem.get(freeDayKey()) || 0;
  if (hasRedis()) {
    try { gasto = Number((await pipeline([['GET', freeDayKey()]]))[0]) || 0; }
    catch (e) { console.error('[custo] redis falhou, usando memória:', e.message); }
  }
  return gasto < freeClaudeDayUsd();
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
 * Antes de despachar: o mês já passou do teto? O saldo dos provedores acabou?
 * 20/11: o OpenUncensored zerou e o app inteiro devolvia 402 mesmo com o Claude (Anthropic) e o
 * OpenRouter com saldo. O bloqueio só vale quando TODOS os provedores estão sem saldo — senão o
 * fallback assume e o usuário continua sendo atendido.
 * ok=false com reason 'monthly_budget' ou 'ou_balance'.
 */
export async function checkGlobalBudget() {
  const budget = Number(process.env.MONTHLY_BUDGET_USD || 25);
  const spent = await monthlySpent();
  if (spent >= budget) return { ok: false, reason: 'monthly_budget', spent, budget };
  const min = Number(process.env.OU_MIN_BALANCE_USD || 1);
  const [ou, anthropic] = await Promise.all([remainingBalance(), anthropicAlive()]);
  const ouOk = ou == null || ou >= min;
  const anthropicOk = anthropic == null || anthropic >= min;
  if (!ouOk && !anthropicOk) return { ok: false, reason: 'ou_balance', balance: ou, anthropic, min };
  return { ok: true, spent, budget, balance: ou, anthropic };
}

// A Anthropic não expõe crédito: o sinal é HTTP 200 numa chamada mínima. Guarda por 10 min.
let _anthropic = { at: 0, ok: null };
async function anthropicAlive() {
  const key = process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (Date.now() - _anthropic.at < 10 * 60 * 1000) return _anthropic.ok === false ? 0 : null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(8000),
    });
    _anthropic = { at: Date.now(), ok: res.ok };
    return res.ok ? null : 0;
  } catch {
    _anthropic = { at: Date.now(), ok: null };
    return null;
  }
}
