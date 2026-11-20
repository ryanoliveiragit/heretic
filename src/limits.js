// Limites de uso em quatro janelas ao mesmo tempo: 5 horas, dia, semana e mês.
// Mensagens, imagens geradas, imagens enviadas e arquivos têm contadores separados, porque custam
// diferente. Cada janela começa no primeiro uso e zera sozinha quando expira, como no Claude Code.
// O uso é reservado ANTES de chamar o provedor (pedidos em paralelo não furam o limite) e devolvido
// se a resposta falhar. Os contadores ficam no Upstash Redis quando UPSTASH_REDIS_REST_URL/TOKEN
// (ou KV_REST_API_URL/TOKEN) existem; sem isso ficam na memória da instância, que zera a cada cold
// start e NÃO serve como limite de verdade em produção.

const HOUR = 3600;
export const WINDOWS = [
  { id: '5h', label: '5 horas', seconds: 5 * HOUR },
  { id: 'day', label: 'dia', seconds: 24 * HOUR },
  { id: 'week', label: 'semana', seconds: 7 * 24 * HOUR },
  { id: 'month', label: 'mês', seconds: 30 * 24 * HOUR },
];

// Ajustáveis sem mexer no código pela env HERETIC_LIMITS, ex.: {"messages":{"free":{"5h":20}}}.
// Limite 0 significa recurso indisponível naquele modelo.
const DEFAULT_LIMITS = {
  messages: {
    free: { '5h': 15, day: 30, week: 120, month: 300 },
    titan: { '5h': 40, day: 100, week: 400, month: 1200 },
    max: { '5h': 15, day: 40, week: 150, month: 400 },
  },
  image_gen: {
    free: { '5h': 2, day: 3, week: 10, month: 20 },
    titan: { '5h': 10, day: 20, week: 80, month: 200 },
    max: { '5h': 10, day: 20, week: 80, month: 200 },
  },
  image_upload: {
    free: { '5h': 0, day: 0, week: 0, month: 0 },
    titan: { '5h': 15, day: 30, week: 100, month: 300 },
    max: { '5h': 5, day: 15, week: 50, month: 120 },
  },
  files: {
    free: { '5h': 3, day: 5, week: 20, month: 40 },
    titan: { '5h': 5, day: 10, week: 40, month: 100 },
    max: { '5h': 3, day: 6, week: 15, month: 30 },
  },
};

function loadLimits() {
  let custom = {};
  try { custom = JSON.parse(process.env.HERETIC_LIMITS || '{}') || {}; } catch { custom = {}; }
  const out = {};
  for (const [resource, buckets] of Object.entries(DEFAULT_LIMITS)) {
    out[resource] = {};
    for (const [bucket, base] of Object.entries(buckets)) {
      out[resource][bucket] = { ...base };
      for (const w of WINDOWS) {
        const n = Number(custom?.[resource]?.[bucket]?.[w.id]);
        if (Number.isFinite(n) && n >= 0) out[resource][bucket][w.id] = Math.floor(n);
      }
    }
  }
  return out;
}

export const LIMITS = loadLimits();
export const RESOURCES = Object.keys(LIMITS);

/** Qual contador um modelo usa. Os modelos de reserva do grátis contam como o próprio grátis. */
export function bucketOf(modelId) {
  if (modelId === 'claude-sonnet-5-5') return 'max';
  if (modelId === 'nousresearch/hermes-4-405b') return 'titan';
  return 'free';
}

// ── quem está sendo contado ──
// IP compartilhado (operadora móvel, empresa) não pode bloquear várias pessoas com o limite de
// uma só: no grátis o aparelho conta 1×, e o IP tem folga de 3× para segurar só quem troca de aparelho.
const SHARED_IP_FACTOR = 3;

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Pro conta pela chave (vale em qualquer aparelho); grátis conta por aparelho e por IP. */
export async function subjectsFor({ plan, proKey, visitorIds }) {
  if (plan === 'pro' && proKey) return [{ id: `key:${await sha256(String(proKey).trim().toUpperCase())}`, factor: 1 }];
  const hasDevice = visitorIds.some(id => id.startsWith('fp:'));
  return visitorIds.map(id => ({ id, factor: id.startsWith('ip:') && hasDevice ? SHARED_IP_FACTOR : 1 }));
}

// ── armazenamento ──
const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const hasRedis = () => !!(REST_URL && REST_TOKEN);
export const limitsStore = () => (hasRedis() ? 'redis' : 'memory');

const mem = new Map();

function memEntry(key) {
  const e = mem.get(key);
  if (e && e.expiresAt <= Date.now()) { mem.delete(key); return null; }
  return e || null;
}

async function pipeline(commands) {
  const res = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`limits store ${res.status}`);
  const rows = await res.json();
  return rows.map((row) => { if (row.error) throw new Error(row.error); return row.result; });
}

/** Soma `delta` de cada entrada e devolve [{ count, ttl }]. A janela nasce no primeiro uso. */
async function bump(entries, sign) {
  if (hasRedis()) {
    try {
      const commands = entries.flatMap(({ key, seconds, amount }) => [
        ['SET', key, '0', 'EX', String(seconds), 'NX'],
        [sign > 0 ? 'INCRBY' : 'DECRBY', key, String(amount)],
        ['TTL', key],
      ]);
      const out = await pipeline(commands);
      return entries.map((_, i) => ({ count: Number(out[i * 3 + 1]) || 0, ttl: Math.max(0, Number(out[i * 3 + 2]) || 0) }));
    } catch (e) { console.error('[limites] redis falhou, usando memória:', e.message); }
  }
  return entries.map(({ key, seconds, amount }) => {
    const e = memEntry(key) || { count: 0, expiresAt: Date.now() + seconds * 1000 };
    e.count += sign * amount;
    mem.set(key, e);
    return { count: e.count, ttl: Math.ceil((e.expiresAt - Date.now()) / 1000) };
  });
}

async function read(entries) {
  if (hasRedis()) {
    try {
      const out = await pipeline(entries.flatMap(({ key }) => [['GET', key], ['TTL', key]]));
      return entries.map((_, i) => ({ count: Number(out[i * 2]) || 0, ttl: Math.max(0, Number(out[i * 2 + 1]) || 0) }));
    } catch (e) { console.error('[limites] redis falhou, usando memória:', e.message); }
  }
  return entries.map(({ key }) => {
    const e = memEntry(key);
    return e ? { count: e.count, ttl: Math.ceil((e.expiresAt - Date.now()) / 1000) } : { count: 0, ttl: 0 };
  });
}

function entriesFor(subjects, charges) {
  return charges.flatMap(({ resource, bucket, amount = 1 }) => WINDOWS.flatMap(w => subjects.map(subject => ({
    resource, bucket, amount, window: w, subject, seconds: w.seconds,
    key: `heretic:quota:${resource}:${bucket}:${w.id}:${subject.id}`,
  }))));
}

// Junta os contadores no formato da API e da tela. Vale o sujeito mais perto do limite.
function summarize({ resource, bucket }, entries, rows) {
  const now = Date.now();
  const windows = WINDOWS.map((w) => {
    const limit = LIMITS[resource][bucket][w.id];
    let used = 0, ttl = 0;
    entries.forEach((entry, i) => {
      if (entry.resource !== resource || entry.bucket !== bucket || entry.window.id !== w.id) return;
      const scaled = Math.ceil(Math.max(0, rows[i].count) / entry.subject.factor);
      if (scaled > used || (scaled === used && rows[i].ttl > ttl)) { used = scaled; ttl = rows[i].ttl; }
    });
    const shown = Math.min(used, limit);
    return { id: w.id, label: w.label, limit, used: shown, remaining: limit - shown, resetAt: shown > 0 && ttl > 0 ? now + ttl * 1000 : null };
  });
  const available = windows.every(w => w.limit > 0);
  // Com mais de uma janela esgotada, só libera quando a mais demorada zerar.
  const full = windows.filter(w => w.remaining <= 0);
  const blockedBy = full.sort((a, b) => (b.resetAt || 0) - (a.resetAt || 0))[0] || null;
  return {
    resource, bucket, available, windows,
    remaining: Math.min(...windows.map(w => w.remaining)),
    blocked: !!blockedBy, blockedBy: blockedBy ? blockedBy.id : null, resetAt: blockedBy ? blockedBy.resetAt : null,
  };
}

/** Situação atual de um recurso, sem gastar nada. */
export async function peekQuota(subjects, resource, bucket) {
  const charge = { resource, bucket };
  const entries = entriesFor(subjects, [charge]);
  return summarize(charge, entries, await read(entries));
}

/**
 * Reserva vários recursos de uma vez. Se qualquer janela estourar, desfaz tudo e devolve
 * ok=false com o recurso que bloqueou. charges = [{ resource, bucket, amount }].
 */
export async function consumeQuota(subjects, charges) {
  const active = charges.filter(c => (c.amount ?? 1) > 0);
  const entries = entriesFor(subjects, active);
  const rows = await bump(entries, 1);
  const overAt = entries.findIndex((entry, i) => rows[i].count > LIMITS[entry.resource][entry.bucket][entry.window.id] * entry.subject.factor);
  if (overAt === -1) return { ok: true, quotas: active.map(c => summarize(c, entries, rows)) };
  const after = await bump(entries, -1);
  const blocked = active.find(c => c.resource === entries[overAt].resource && c.bucket === entries[overAt].bucket);
  return { ok: false, quota: summarize(blocked, entries, after), requested: blocked.amount ?? 1 };
}

/** Devolve o que foi reservado quando o provedor não entregou o resultado. */
export async function refundQuota(subjects, charges) {
  const active = charges.filter(c => (c.amount ?? 1) > 0);
  const entries = entriesFor(subjects, active);
  const rows = await bump(entries, -1);
  return active.map(c => summarize(c, entries, rows));
}
