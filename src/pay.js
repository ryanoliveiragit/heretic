// Pagamento do Pro: Pix via AbacatePay (checkout hospedado) e cripto via NOWPayments.
// Contrato casado com o app (pay.tsx):
//   GET  /api/pay            -> { methods:{pix,cripto}, periods:{mensal,trimestral,anual:{cents,days}} }
//   POST /api/pay            -> cria a cobrança e devolve { id, url } (a tela redireciona)
//   GET  /api/pay/:orderId   -> status { id,status,method,period,cents,key?,expiresAt?,url? }
//   POST /api/payment?p=     -> aviso do processador (abacate|nowpayments): confirma e libera o Pro
//
// Ao confirmar, gera uma CHAVE PRO ASSINADA COM VALIDADE (plans.issuePaidKey) — sem banco de chaves.
// Se o comprador já tinha Pro com tempo restante, o período novo soma. O polling também tenta
// autoconfirmar. Segredos: ABACATEPAY_API_KEY, ABACATEPAY_WEBHOOK_SECRET, NOWPAYMENTS_API_KEY,
// NOWPAYMENTS_IPN_SECRET. PAY_MODE=mock pula as chamadas reais (para teste local do webhook).

import { Hono } from 'hono';
import { issuePaidKey, verifyPaidKey, keyFrom } from './plans.js';

export const PERIODS = {
  // Preços novos (dono 20/11, "subir todos"): produtos novos na AbacatePay; os antigos ficam lá sem uso.
  mensal:     { cents: 5990,  days: 30,  product: '451sh-pro-mensal-5990' },
  trimestral: { cents: 15990, days: 90,  product: '451sh-pro-trimestral-15990' },
  anual:      { cents: 53990, days: 365, product: '451sh-pro-anual-53990' },
  // Só para testar o pagamento real (R$ 1,00, 1 dia). Escondido da tela e exige a chave de admin.
  teste:      { cents: 100,   days: 1,   product: '451sh-pro-teste', hidden: true },
};
const isAdmin = (c) => {
  const k = process.env.ADMIN_KEY || process.env.HERETIC_ADMIN_KEY || '';
  return !!k && safeEqual(k, c.req.header('x-451-admin') || c.req.header('x-heretic-admin') || '');
};

const MOCK = () => process.env.PAY_MODE === 'mock';
const ABACATE_KEY = () => process.env.ABACATEPAY_API_KEY || '';
const ABACATE_SECRET = () => process.env.ABACATEPAY_WEBHOOK_SECRET || '';
const NOW_KEY = () => process.env.NOWPAYMENTS_API_KEY || '';
const NOW_IPN = () => process.env.NOWPAYMENTS_IPN_SECRET || '';
const ABACATE_BASE = 'https://api.abacatepay.com/v2';

// ── armazenamento do pedido ──
const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const hasRedis = () => !!(REST_URL && REST_TOKEN);
const mem = new Map();
const oKey = (id) => `pay:order:${id}`;
async function redisPipe(commands) {
  const res = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`pay store ${res.status}`);
  return (await res.json()).map((r) => { if (r.error) throw new Error(r.error); return r.result; });
}
async function saveOrder(o) {
  o.updatedAt = Date.now();
  if (hasRedis()) { try { await redisPipe([['SET', oKey(o.id), JSON.stringify(o), 'EX', String(7 * 86400)]]); return o; } catch (e) { console.error('[pay] redis set:', e.message); } }
  mem.set(oKey(o.id), JSON.stringify(o)); return o;
}
async function loadOrder(id) {
  if (!id) return null;
  if (hasRedis()) { try { const [v] = await redisPipe([['GET', oKey(id)]]); return v ? JSON.parse(v) : null; } catch (e) { console.error('[pay] redis get:', e.message); } }
  const v = mem.get(oKey(id)); return v ? JSON.parse(v) : null;
}

const newOrderId = () => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let s = ''; for (let i = 0; i < 12; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };
const origin = (c) => `https://${c.req.header('x-forwarded-host') || c.req.header('host') || '451sh.com'}`;
function targetExpiry(currentKey, days) {
  const v = verifyPaidKey(currentKey);
  const base = v && v.expiresAt > Date.now() ? v.expiresAt : Date.now();
  return base + days * 86400 * 1000;
}
/** Igualdade em tempo constante (não vaza a diferença pela duração da comparação). */
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── AbacatePay (Pix) ──
async function abacateCreate(order, c) {
  if (MOCK()) return `${origin(c)}/app/?pedido=${order.id}&mock=1`;
  const back = `${origin(c)}/app/?pedido=${order.id}`;
  const r = await fetch(`${ABACATE_BASE}/checkouts/create`, {
    method: 'POST', headers: { Authorization: `Bearer ${ABACATE_KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: PERIODS[order.period].product, quantity: 1 }], methods: ['PIX'], externalId: order.id, returnUrl: back, completionUrl: back, metadata: { orderId: order.id } }),
  });
  const d = await r.json().catch(() => ({}));
  const url = d?.data?.url;
  if (!r.ok || !url) throw new Error(d?.error || 'AbacatePay não criou a cobrança.');
  order.processorId = d.data.id;
  return url;
}
async function abacatePaid(order) {
  if (MOCK()) return false;
  try {
    // Consulta o checkout pelo nosso externalId (o pedido). Autoconfirma mesmo sem webhook.
    const r = await fetch(`${ABACATE_BASE}/checkouts/list?externalId=${encodeURIComponent(order.id)}`, { headers: { Authorization: `Bearer ${ABACATE_KEY()}` } });
    if (!r.ok) return false;
    const d = await r.json().catch(() => ({}));
    return (d?.data || []).some((x) => String(x.status) === 'PAID');
  } catch { return false; }
}

// ── NOWPayments (cripto) ──
async function nowCreate(order, c) {
  if (MOCK()) return `${origin(c)}/app/?pedido=${order.id}&mock=1`;
  const back = `${origin(c)}/app/?pedido=${order.id}`;
  const r = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST', headers: { 'x-api-key': NOW_KEY(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ price_amount: order.cents / 100, price_currency: 'brl', order_id: order.id, order_description: `451.sh Pro — ${order.period}`, ipn_callback_url: `${origin(c)}/api/payment?p=nowpayments`, success_url: back, cancel_url: back }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.invoice_url) throw new Error(d?.message || 'NOWPayments não criou a cobrança.');
  order.processorId = String(d.id || '');
  return d.invoice_url;
}
async function nowPaid(order) {
  if (MOCK() || !order.processorId) return false;
  try {
    const r = await fetch(`https://api.nowpayments.io/v1/payment/?invoiceId=${encodeURIComponent(order.processorId)}`, { headers: { 'x-api-key': NOW_KEY() } });
    if (!r.ok) return false;
    const d = await r.json().catch(() => ({}));
    return (d?.data || d?.payments || []).some((p) => ['finished', 'confirmed', 'sending'].includes(String(p.payment_status)));
  } catch { return false; }
}

async function hmacSha512Hex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function sortedJson(o) {
  if (Array.isArray(o)) return o.map(sortedJson);
  if (o && typeof o === 'object') return Object.keys(o).sort().reduce((a, k) => { a[k] = sortedJson(o[k]); return a; }, {});
  return o;
}

async function markPaid(order) {
  if (order.status === 'paid' && order.key) return order;
  order.status = 'paid';
  order.expiresAt = order.targetExp;
  order.key = issuePaidKey('pro', order.expiresAt);
  return saveOrder(order);
}

// ── rotas do app ──
export const pay = new Hono();

pay.get('/', (c) => c.json({
  methods: { pix: (ABACATE_KEY() || MOCK()) ? 'AbacatePay' : null, cripto: (NOW_KEY() || MOCK()) ? 'NOWPayments' : null },
  periods: Object.fromEntries(Object.entries(PERIODS).filter(([, v]) => !v.hidden).map(([k, v]) => [k, { cents: v.cents, days: v.days }])),
}));

pay.post('/', async (c) => {
  let body = {}; try { body = await c.req.json(); } catch {}
  let period = ['mensal', 'trimestral', 'anual'].includes(body.period) ? body.period : 'mensal';
  if (body.period === 'teste') {
    if (!isAdmin(c)) return c.json({ message: 'Período de teste só com a chave de admin.' }, 403);
    period = 'teste';
  }
  const method = body.method === 'cripto' ? 'cripto' : body.method === 'pix' ? 'pix' : null;
  if (!method) return c.json({ message: 'Escolha Pix ou cripto.' }, 400);
  if (method === 'pix' && !ABACATE_KEY() && !MOCK()) return c.json({ message: 'Pix ainda não está ligado.' }, 400);
  if (method === 'cripto' && !NOW_KEY() && !MOCK()) return c.json({ message: 'Cripto ainda não está ligado.' }, 400);
  const { cents, days } = PERIODS[period];
  const order = { id: newOrderId(), status: 'pending', method, period, cents, targetExp: targetExpiry(keyFrom(c), days), createdAt: Date.now() };
  try { order.url = method === 'pix' ? await abacateCreate(order, c) : await nowCreate(order, c); }
  catch (e) { return c.json({ message: e.message || 'Não consegui criar a cobrança.' }, 502); }
  await saveOrder(order);
  return c.json({ id: order.id, url: order.url });
});

pay.get('/:orderId', async (c) => {
  const order = await loadOrder(c.req.param('orderId'));
  if (!order) return c.json({ message: 'Pedido não encontrado.' }, 404);
  if (order.status === 'pending') {
    if (order.createdAt && Date.now() - order.createdAt > 3600e3) { order.status = 'expired'; await saveOrder(order); }
    else if (await (order.method === 'pix' ? abacatePaid(order) : nowPaid(order))) await markPaid(order);
  }
  const { id, status, method, period, cents, key, expiresAt, url } = order;
  return c.json({ id, status, method, period, cents, key, expiresAt, url });
});

/** Aviso dos processadores. ?p=abacate|nowpayments. Confere o segredo/assinatura antes de liberar. */
export async function payWebhook(c) {
  const p = c.req.query('p');
  let raw = ''; try { raw = await c.req.text(); } catch {}
  let data = {}; try { data = JSON.parse(raw || '{}'); } catch {}

  if (p === 'abacate') {
    const secret = ABACATE_SECRET();
    const got = c.req.query('webhookSecret') || c.req.header('x-webhook-secret') || '';
    if (!secret || !safeEqual(secret, got)) return c.json({ ok: false, error: 'bad_secret' }, 401);
    const event = String(data?.event || '');
    const paidEvent = event === 'checkout.completed' || event === 'transparent.completed' || String(data?.data?.status) === 'PAID';
    const id = data?.data?.externalId || data?.data?.metadata?.orderId || data?.externalId;
    const order = await loadOrder(id);
    if (order && order.status !== 'paid' && paidEvent) await markPaid(order);
    return c.json({ ok: true });
  }
  if (p === 'nowpayments') {
    const secret = NOW_IPN();
    if (secret) {
      const expected = await hmacSha512Hex(secret, JSON.stringify(sortedJson(data)));
      if (!safeEqual(expected, c.req.header('x-nowpayments-sig') || '')) return c.json({ ok: false, error: 'bad_sig' }, 401);
    }
    const order = await loadOrder(data?.order_id);
    if (order && order.status !== 'paid' && ['finished', 'confirmed', 'sending'].includes(String(data?.payment_status))) await markPaid(order);
    return c.json({ ok: true });
  }
  return c.json({ ok: false, error: 'unknown_processor' }, 400);
}
