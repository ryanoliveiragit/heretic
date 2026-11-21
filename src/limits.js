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
// Grade estilo Venice (dono 19/11):
//   free      → plano grátis, qualquer modelo liberado (o Titan): 15 mensagens por dia.
//   pro       → Pro e Pro Plus nos modelos 451 (Rapid, Titan, Max): "ilimitado" com uso justo.
//               Ao bater o teto do dia, a conversa NÃO para: segue no Rapid (bucket pro_rapid).
//   pro_rapid → o Rapid depois do uso justo; teto alto só contra robô/abuso.
//   credits   → Hermes e Kimi; o limite real é o saldo de créditos, este é só anti-abuso.
// O app não mostra o medidor dos buckets pagos (ver HIDDEN_BUCKETS): para o assinante é ilimitado.
const DEFAULT_LIMITS = {
  messages: {
    free: { '5h': 15, day: 15, week: 90, month: 360 },
    pro: { '5h': 100, day: 200, week: 1200, month: 4000 },
    pro_rapid: { '5h': 300, day: 800, week: 4000, month: 12000 },
    credits: { '5h': 200, day: 400, week: 2000, month: 6000 },
  },
  image_gen: {
    free: { '5h': 2, day: 3, week: 10, month: 20 },
    pro: { '5h': 10, day: 20, week: 80, month: 200 },
    pro_rapid: { '5h': 10, day: 20, week: 80, month: 200 },
    credits: { '5h': 10, day: 20, week: 80, month: 200 },
  },
  image_upload: {
    // Fotos no grátis (dono 21/11): 3 por dia por aparelho, lidas pelo Inkling sem censura (verba diária em cost.js).
    free: { '5h': 3, day: 3, week: 15, month: 40 },
    pro: { '5h': 15, day: 30, week: 100, month: 300 },
    pro_rapid: { '5h': 15, day: 30, week: 100, month: 300 },
    credits: { '5h': 5, day: 15, week: 50, month: 120 },
  },
  files: {
    free: { '5h': 3, day: 5, week: 20, month: 40 },
    pro: { '5h': 5, day: 10, week: 40, month: 100 },
    pro_rapid: { '5h': 5, day: 10, week: 40, month: 100 },
    credits: { '5h': 3, day: 6, week: 15, month: 30 },
  },
};
export const HIDDEN_BUCKETS = ['pro', 'pro_rapid', 'credits', 'local'];

function loadLimits() {
  let custom = {};
  try { custom = JSON.parse(process.env.APP_LIMITS || process.env.HERETIC_LIMITS || '{}') || {}; } catch { custom = {}; }
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

/** Qual contador um pedido usa: depende do plano e do modelo. */
export function bucketOf(modelId, tier = 'free') {
  // Modelos locais (21/11): sem cota e sem custo, em qualquer plano.
  if (String(modelId || '').startsWith('local:')) return 'local';
  if (tier === 'free') return 'free';
  if (modelId === 'hermes-4-405b' || modelId === 'kimi-k3.1-pro-uncensored') return 'credits';
  return 'pro';
}

// ── quem está sendo contado ──
// IP compartilhado (operadora móvel, empresa) não pode bloquear várias pessoas com o limite de
// uma só: no grátis o aparelho conta 1×, e o IP tem folga de 3× para segurar só quem troca de aparelho.
const SHARED_IP_FACTOR = 3;

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
/** Id do assinante a partir da chave Pro (o mesmo do teto de gasto): liga pagamento e uso sem guardar a chave. */
export async function idDaChave(key) { return `key:${await sha256(String(key).trim().toUpperCase())}`; }

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

// ── Teto por CUSTO REAL (dono 20/11) ──
// Antes o Pro só contava mensagens: um "oi" e um pentest detalhado pesavam igual, e um Pro pesado
// podia custar US$ 50–70/mês contra ~US$ 9 de receita. Agora cada resposta soma o custo real que o
// provedor devolve (US$), em unidades de US$ 0,0001, por chave e por janela.
//   pro       → Max/Titan/Rapid escolhidos. Passou → a conversa segue no Rapid (pro_rapid).
//   pro_rapid → o Rapid do uso justo. Passou → para até a janela zerar.
// Teto único (dono 20/11, "sair do prejuízo"): chat E imagens do Pro gastam deste medidor. Pior caso por
// assinante: US$ 2,60 + US$ 1,00 = US$ 3,60/mês (+ créditos, que já têm margem). Com US$ 1 = R$ 5,77 isso
// dá margem mínima de 30% no anual (R$ 33,26/mês líquido), 46% no trimestral e 53% no mensal.
// Antes: US$ 4 + US$ 2 = US$ 6 → prejuízo no anual. Ajuste sem deploy de código: APP_SPEND_LIMITS (JSON).
const SPEND_UNIT = 1e-4;
const DEFAULT_SPEND = {
  pro: { '5h': 1500, day: 2500, week: 9000, month: 26000 },         // US$ 0,15 / 0,25 / 0,90 / 2,60
  pro_rapid: { '5h': 600, day: 1000, week: 3500, month: 10000 },    // US$ 0,06 / 0,10 / 0,35 / 1,00
};
function loadSpend() {
  let custom = {};
  try { custom = JSON.parse(process.env.APP_SPEND_LIMITS || '{}') || {}; } catch { custom = {}; }
  const out = {};
  for (const [bucket, base] of Object.entries(DEFAULT_SPEND)) {
    out[bucket] = { ...base };
    for (const w of WINDOWS) {
      const n = Number(custom?.[bucket]?.[w.id]);
      if (Number.isFinite(n) && n >= 0) out[bucket][w.id] = Math.floor(n);
    }
  }
  return out;
}
export const SPEND_LIMITS = loadSpend();

function spendEntries(subjects, bucket, amount = 1) {
  return WINDOWS.flatMap(w => subjects.map(subject => ({
    resource: 'spend', bucket, amount, window: w, subject, seconds: w.seconds,
    key: `heretic:spend:${bucket}:${w.id}:${subject.id}`,
  })));
}

/** Situação do teto de gasto: { tracked, blocked, resetAt, windows:[{id, pct}] }. Sem teto para o bucket → tracked=false. */
export async function spendStatus(subjects, bucket) {
  const lim = SPEND_LIMITS[bucket];
  if (!lim) return { tracked: false, blocked: false, resetAt: null, windows: [] };
  const entries = spendEntries(subjects, bucket);
  const rows = await read(entries);
  const now = Date.now();
  const windows = WINDOWS.map((w) => {
    let used = 0, ttl = 0;
    entries.forEach((e, i) => { if (e.window.id === w.id && rows[i].count > used) { used = rows[i].count; ttl = rows[i].ttl; } });
    const limit = lim[w.id];
    return { id: w.id, label: w.label, pct: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100, full: used >= limit, resetAt: ttl > 0 ? now + ttl * 1000 : null };
  });
  const full = windows.filter(w => w.full).sort((a, b) => (b.resetAt || 0) - (a.resetAt || 0));
  return { tracked: true, blocked: full.length > 0, resetAt: full[0]?.resetAt || null, blockedBy: full[0]?.id || null, windows: windows.map(({ full: _f, ...w }) => w) };
}

/** Soma o custo real (US$) de uma resposta no teto do bucket. Arredonda para cima: nenhuma resposta sai de graça. */
export async function addSpend(subjects, bucket, usd) {
  if (!SPEND_LIMITS[bucket]) return;
  const amount = Math.max(1, Math.ceil((Number(usd) || 0) / SPEND_UNIT));
  if (!(Number(usd) > 0)) return;
  await bump(spendEntries(subjects, bucket, amount), 1);
}
