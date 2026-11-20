// Pagamento do Pro por Pix (AbacatePay, dono 19/11; antes Woovi) ou cripto (NOWPayments), dono 18/11.
// Fluxo: o app pede POST /api/pay → o servidor cria a cobrança no processador e devolve o link →
// a pessoa paga na página do processador e volta para /app/?pedido=<id> → o app consulta
// GET /api/pay/<id> até o pagamento confirmar → o servidor gera a chave Pro paga (plans.js) e o app
// já a ativa no aparelho. Sem conta e sem e-mail.
// Confirmação: Pix é conferido direto na API v2 da AbacatePay (GET /checkouts/get, fonte da verdade);
// o webhook checkout.completed só dispara essa mesma conferência, nunca libera pelo corpo do aviso.
// Os produtos 451sh-pro-<período> já existem na AbacatePay com o mesmo preço de PERIODS (criados 19/11):
// mudou um preço aqui, crie um produto novo lá (o preço do produto não muda pela API).
// cripto chega pelo IPN da NOWPayments, que só vale com a assinatura HMAC-SHA512 certa e depois de
// conferir o status na própria API. Só "finished" libera.
// Modo simulado (PAY_MODE=mock): para testar sem conta; nunca liga sozinho.
import { issuePaidKey, paidKeyExpiry } from './plans.js';

const DAY = 864e5;
export const PERIODS = {
  mensal: { cents: 4999, days: 30, label: 'mensal' },
  trimestral: { cents: 12990, days: 90, label: 'trimestral' },
  anual: { cents: 39990, days: 365, label: 'anual' },
};
export const METHODS = ['pix', 'cripto'];

const mockMode = () => process.env.PAY_MODE === 'mock';
const abacate = () => ({
  key: process.env.ABACATEPAY_API_KEY || '',
  webhookSecret: process.env.ABACATEPAY_WEBHOOK_SECRET || '',
  base: (process.env.ABACATEPAY_API || 'https://api.abacatepay.com/v2').replace(/\/$/, ''),
});
const abacateProduct = (period) => `451sh-pro-${period}`;
async function abacateFetch(path, init = {}) {
  const a = abacate();
  const res = await fetch(`${a.base}${path}`, { ...init, headers: { Authorization: `Bearer ${a.key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body?.success !== false, data: body?.data, error: body?.error, status: res.status };
}
const nowp = () => ({
  apiKey: process.env.NOWPAYMENTS_API_KEY || '',
  ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET || '',
  base: (process.env.NOWPAYMENTS_API || 'https://api.nowpayments.io/v1').replace(/\/$/, ''),
  currency: (process.env.NOWPAYMENTS_CURRENCY || 'brl').toLowerCase(),
});

/** Quais formas de pagamento estão ligadas agora (o app esconde as outras). */
export function availableMethods() {
  if (mockMode()) return { pix: 'simulado', cripto: 'simulado' };
  return { pix: abacate().key ? 'abacatepay' : null, cripto: nowp().apiKey && nowp().ipnSecret ? 'nowpayments' : null };
}

// ── pedidos: Upstash Redis em produção, memória no teste local ──
const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const mem = new Map();
const ORDER_TTL = 7 * 24 * 3600; // o pedido (e a chave) fica consultável por 7 dias
const orderKey = (id) => `heretic:pay:${id}`;

async function redis(command) {
  const res = await fetch(REST_URL, { method: 'POST', headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  if (!res.ok) throw new Error(`pedidos ${res.status}`);
  return (await res.json()).result;
}
async function saveOrder(order) {
  if (REST_URL && REST_TOKEN) await redis(['SET', orderKey(order.id), JSON.stringify(order), 'EX', String(ORDER_TTL)]);
  else mem.set(order.id, JSON.parse(JSON.stringify(order)));
  return order;
}
export async function loadOrder(id) {
  if (!/^[0-9A-Z]{12}$/.test(String(id || ''))) return null;
  if (REST_URL && REST_TOKEN) { const raw = await redis(['GET', orderKey(id)]); return raw ? JSON.parse(raw) : null; }
  return mem.has(id) ? JSON.parse(JSON.stringify(mem.get(id))) : null;
}

function newOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const abc = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return [...bytes].map(b => abc[b % 36]).join('');
}

/** Marca o pedido como pago e gera a chave. Idempotente: pagar duas vezes não gera outra chave. */
async function markPaid(order, processorRef) {
  if (order.status === 'paid') return order;
  const start = Math.max(Date.now(), order.renewFrom || 0);
  // Em segundos inteiros: é a precisão que a chave guarda, então pedido e /api/me mostram a mesma data.
  order.expiresAt = Math.floor((start + PERIODS[order.period].days * DAY) / 1000) * 1000;
  order.key = await issuePaidKey(order.id, order.expiresAt);
  order.status = 'paid';
  order.paidAt = Date.now();
  if (processorRef) order.processorRef = String(processorRef).slice(0, 80);
  return saveOrder(order);
}

/** Cria o pedido e a cobrança. Devolve { id, url } ou lança { status, message }. */
export async function createPayment({ method, period, currentKey, origin }) {
  if (!METHODS.includes(method) || !PERIODS[period]) throw Object.assign(new Error('Forma de pagamento ou período inválido.'), { status: 400 });
  const avail = availableMethods()[method];
  if (!avail) throw Object.assign(new Error(method === 'pix' ? 'O Pix ainda não está ligado.' : 'O pagamento em cripto ainda não está ligado.'), { status: 503 });
  // Renovação: o que sobrou da chave atual soma no período novo.
  const currentExp = currentKey ? await paidKeyExpiry(currentKey) : null;
  const plan = PERIODS[period];
  const order = { id: newOrderId(), method, period, cents: plan.cents, renewFrom: currentExp && currentExp > Date.now() ? currentExp : 0, status: 'pending', createdAt: Date.now() };
  const back = `${origin}/app/?pedido=${order.id}`;

  if (avail === 'simulado') {
    order.url = `${origin}/api/pay/simulado/${order.id}`;
  } else if (method === 'pix') {
    const r = await abacateFetch('/checkouts/create', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: abacateProduct(period), quantity: 1 }], methods: ['PIX'], externalId: order.id,
        returnUrl: `${back}&cancelado=1`, completionUrl: back, metadata: { pedido: order.id, periodo: period },
      }),
    });
    if (!r.ok || !r.data?.url) throw Object.assign(new Error('A AbacatePay não criou a cobrança. Tente de novo em instantes.'), { status: 502, detail: String(r.error || r.status).slice(0, 300) });
    if (Number(r.data.amount) !== plan.cents) throw Object.assign(new Error('O preço do Pix não confere. Fale com o suporte.'), { status: 502, detail: `produto ${abacateProduct(period)} = ${r.data.amount}` });
    // Sem cadastro: pula a tela de dados pessoais no Pix.
    order.url = `${r.data.url}${r.data.url.includes('?') ? '&' : '?'}skip_customer=true`;
    order.processorRef = String(r.data.id || '');
  } else {
    const n = nowp();
    const res = await fetch(`${n.base}/invoice`, {
      method: 'POST',
      headers: { 'x-api-key': n.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: plan.cents / 100, price_currency: n.currency, order_id: order.id,
        order_description: `451.sh Pro ${plan.label}`,
        ipn_callback_url: `${origin}/api/pay/nowpayments`, success_url: back, cancel_url: `${back}&cancelado=1`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.invoice_url) throw Object.assign(new Error('A NOWPayments não criou a cobrança. Tente de novo em instantes.'), { status: 502, detail: JSON.stringify(data).slice(0, 300) });
    order.url = data.invoice_url;
    order.processorRef = String(data.id || '');
  }
  await saveOrder(order);
  return { id: order.id, url: order.url };
}

/** Situação do pedido. Pix pendente é conferido na hora na Woovi. */
export async function paymentStatus(id) {
  const order = await loadOrder(id);
  if (!order) return null;
  if (order.status === 'pending' && order.method === 'pix' && availableMethods().pix === 'abacatepay' && order.processorRef) {
    try {
      const r = await abacateFetch(`/checkouts/get?id=${encodeURIComponent(order.processorRef)}`);
      const c = r.data;
      if (r.ok && c && c.externalId === order.id) {
        if (c.status === 'PAID' && Number(c.paidAmount ?? c.amount) >= order.cents) await markPaid(order, c.id);
        else if (['EXPIRED', 'CANCELLED'].includes(c.status)) { order.status = 'expired'; await saveOrder(order); }
      }
    } catch { /* tenta de novo na próxima consulta */ }
  }
  const fresh = (await loadOrder(id)) || order;
  return { id: fresh.id, status: fresh.status, method: fresh.method, period: fresh.period, cents: fresh.cents, ...(fresh.status === 'pending' ? { url: fresh.url } : {}), ...(fresh.status === 'paid' ? { key: fresh.key, expiresAt: fresh.expiresAt } : {}) };
}

// ── IPN da NOWPayments ──
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = sortDeep(v[k]); return o; }, {});
  return v;
}
async function hmacSha512Hex(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function ipnSignature(body, secret) { return hmacSha512Hex(secret, JSON.stringify(sortDeep(body))); }

/** Recebe o IPN. Só libera com assinatura válida, status "finished" conferido na API e valor certo. */
export async function handleNowPaymentsIpn(rawBody, signature) {
  const n = nowp();
  if (!n.ipnSecret || !n.apiKey) return { ok: false, status: 503 };
  let body;
  try { body = JSON.parse(rawBody); } catch { return { ok: false, status: 400 }; }
  const expected = await ipnSignature(body, n.ipnSecret);
  if (!sameText(String(signature || '').toLowerCase(), expected)) return { ok: false, status: 401 };
  const order = await loadOrder(String(body.order_id || ''));
  if (!order || order.method !== 'cripto') return { ok: true, status: 200, ignored: 'pedido desconhecido' };
  if (body.payment_status !== 'finished') return { ok: true, status: 200, ignored: body.payment_status };
  // Confere na própria API antes de liberar (não confia só no corpo do aviso).
  const res = await fetch(`${n.base}/payment/${encodeURIComponent(body.payment_id)}`, { headers: { 'x-api-key': n.apiKey } });
  const pay = await res.json().catch(() => ({}));
  if (!res.ok || pay.payment_status !== 'finished' || String(pay.order_id) !== order.id) return { ok: false, status: 409 };
  if (Number(pay.price_amount) + 0.001 < order.cents / 100) return { ok: false, status: 409 };
  await markPaid(order, body.payment_id);
  return { ok: true, status: 200 };
}

/** Webhook v2 da AbacatePay. Só aceita com o segredo certo e não confia no corpo: reconfere na API. */
export async function handleAbacateWebhook(rawBody, secret) {
  const a = abacate();
  if (!a.key || !a.webhookSecret) return { ok: false, status: 503 };
  if (!sameText(String(secret || ''), a.webhookSecret)) return { ok: false, status: 401 };
  let body;
  try { body = JSON.parse(rawBody); } catch { return { ok: false, status: 400 }; }
  if (body?.event !== 'checkout.completed') return { ok: true, status: 200, ignored: body?.event };
  const id = String(body?.data?.checkout?.externalId || '');
  const order = await loadOrder(id);
  if (!order || order.method !== 'pix') return { ok: true, status: 200, ignored: 'pedido desconhecido' };
  const st = await paymentStatus(id);
  return { ok: true, status: 200, paid: st?.status === 'paid' };
}

/** Só no modo simulado: confirma o pagamento de teste. */
export async function confirmMock(id) {
  if (!mockMode()) return null;
  const order = await loadOrder(id);
  if (!order) return null;
  return markPaid(order, 'simulado');
}
