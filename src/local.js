// Modelos locais do 451 (21/11): rodam no computador do dono, atrás do gateway do agente Super Hacking
// (porta 8000, com fila e troca de modelo). O site chega lá por um túnel da Cloudflare até o "porteiro"
// (porteiro-local/porteiro.mjs), que só aceita o segredo LOCAL_LLM_TOKEN. O endereço do túnel muda quando
// ele reinicia: o porteiro avisa o site (POST /api/local/registro) e o endereço fica no Redis.
// LOCAL_LLM_URL fixa um endereço (teste local ou túnel com nome próprio) e vale antes do Redis.

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const CHAVE = '451:local:url';
export const URL_TUNEL = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

let memoria = null;                 // sem Redis (teste local): o endereço fica no processo
let cache = { at: 0, url: null };   // cada instância relê o Redis a cada 15 s

export const localToken = () => process.env.LOCAL_LLM_TOKEN || '';

/** Compara o segredo recebido sem vazar o tamanho do acerto pelo tempo. */
export function tokenConfere(recebido) {
  const a = String(recebido || ''), b = localToken();
  if (!b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function redis(cmd) {
  const r = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd]),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const [row] = await r.json();
  if (row?.error) throw new Error(row.error);
  return row?.result ?? null;
}

/** O porteiro avisou o endereço novo do túnel. */
export async function gravaUrlLocal(url) {
  memoria = url;
  cache = { at: Date.now(), url };
  if (REST_URL && REST_TOKEN) await redis(['SET', CHAVE, url]);
}

/** Endereço atual do porteiro (sem barra no fim) ou null se ele nunca se registrou. */
export async function urlLocal() {
  if (process.env.LOCAL_LLM_URL) return process.env.LOCAL_LLM_URL.replace(/\/+$/, '');
  if (cache.url && Date.now() - cache.at < 15000) return cache.url;
  let url = memoria;
  if (REST_URL && REST_TOKEN) {
    try { url = (await redis(['GET', CHAVE])) || url; } catch (e) { console.error('[local] redis:', e.message); }
  }
  cache = { at: Date.now(), url };
  return url;
}
