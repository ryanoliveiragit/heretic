// Uso: node scripts/teste-comandos-redis.mjs <pasta src> [saída.json]
// Conta os comandos do Upstash por mensagem, sem rede e sem custo: um Upstash FALSO (REST: /pipeline e
// /cmd/arg…) e provedores de IA falsos. Mede o /api/chat de cada tipo de mensagem e o /api/me que o app
// chama depois de cada resposta. Serve para conferir o custo extra de qualquer mudança no registro de uso.
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const [dir, saida] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Upstash falso ──
const db = new Map(); // chave → { t: 'str'|'hash'|'list'|'set'|'zset', v }
let contagem = 0; const porComando = {};
const get = (k, t, novo) => { let e = db.get(k); if (!e) { e = { t, v: novo() }; db.set(k, e); } return e.v; };
function roda([cmdRaw, ...a]) {
  const cmd = String(cmdRaw).toUpperCase(); contagem += 1; porComando[cmd] = (porComando[cmd] || 0) + 1;
  const k = a[0];
  switch (cmd) {
    case 'GET': { const e = db.get(k); return e && e.t === 'str' ? e.v : null; }
    case 'SET': { const nx = a.map((x) => String(x).toUpperCase()).includes('NX'); if (nx && db.has(k)) return null; db.set(k, { t: 'str', v: String(a[1]) }); return 'OK'; }
    case 'INCRBY': case 'DECRBY': case 'INCRBYFLOAT': { const e = db.get(k); const cur = Number(e?.v) || 0; const d = Number(a[1]) * (cmd === 'DECRBY' ? -1 : 1); const v = cur + d; db.set(k, { t: 'str', v: String(v) }); return cmd === 'INCRBYFLOAT' ? String(v) : v; }
    case 'INCR': { const v = (Number(db.get(k)?.v) || 0) + 1; db.set(k, { t: 'str', v: String(v) }); return v; }
    case 'EXPIRE': case 'PEXPIRE': return db.has(k) ? 1 : 0;
    case 'TTL': return db.has(k) ? 3600 : -2;
    case 'DEL': { let n = 0; for (const x of a) if (db.delete(x)) n += 1; return n; }
    case 'EXISTS': return a.filter((x) => db.has(x)).length;
    case 'HINCRBY': { const h = get(k, 'hash', () => new Map()); const v = (Number(h.get(a[1])) || 0) + Number(a[2]); h.set(a[1], String(v)); return v; }
    case 'HSET': { const h = get(k, 'hash', () => new Map()); for (let i = 1; i + 1 < a.length; i += 2) h.set(a[i], String(a[i + 1])); return 1; }
    case 'HSETNX': { const h = get(k, 'hash', () => new Map()); if (h.has(a[1])) return 0; h.set(a[1], String(a[2])); return 1; }
    case 'HGET': { const h = db.get(k)?.v; return h instanceof Map ? (h.get(a[1]) ?? null) : null; }
    case 'HGETALL': { const h = db.get(k)?.v; return h instanceof Map ? [...h.entries()].flat() : []; }
    case 'LPUSH': { const l = get(k, 'list', () => []); for (const x of a.slice(1)) l.unshift(String(x)); return l.length; }
    case 'RPUSH': { const l = get(k, 'list', () => []); for (const x of a.slice(1)) l.push(String(x)); return l.length; }
    case 'LTRIM': { const l = db.get(k)?.v; if (Array.isArray(l)) l.splice(Number(a[2]) + 1); return 'OK'; }
    case 'LRANGE': { const l = db.get(k)?.v || []; const fim = Number(a[2]); return l.slice(Number(a[1]), fim < 0 ? undefined : fim + 1); }
    case 'SADD': case 'PFADD': { const s = get(k, 'set', () => new Set()); const n = s.size; for (const x of a.slice(1)) s.add(String(x)); return cmd === 'PFADD' ? (s.size > n ? 1 : 0) : s.size - n; }
    case 'SCARD': return db.get(k)?.v?.size || 0;
    case 'PFCOUNT': { const u = new Set(); for (const x of a) (db.get(x)?.v || []).forEach((y) => u.add(y)); return u.size; }
    case 'ZADD': { const z = get(k, 'zset', () => new Map()); const nx = String(a[1]).toUpperCase() === 'NX'; const [sc, m] = nx ? a.slice(2) : a.slice(1); if (nx && z.has(m)) return 0; z.set(m, Number(sc)); return 1; }
    case 'ZREVRANGE': { const z = db.get(k)?.v; if (!z) return []; const l = [...z.entries()].sort((x, y) => y[1] - x[1]).slice(Number(a[1]), Number(a[2]) + 1); return l.flatMap(([m, s]) => [m, String(s)]); }
    case 'KEYS': { const re = new RegExp('^' + String(k).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); return [...db.keys()].filter((x) => re.test(x)); }
    default: throw new Error(`comando sem suporte no Upstash falso: ${cmd}`);
  }
}
const upstash = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  try {
    const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let saidaR;
    if (caminho === '/pipeline') saidaR = JSON.parse(raw || '[]').map((c) => { try { return { result: roda(c) }; } catch (e) { return { error: e.message }; } });
    else if (caminho === '/' || caminho === '') saidaR = { result: roda(JSON.parse(raw)) };
    else saidaR = { result: roda(caminho.split('/').filter(Boolean)) };
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(saidaR));
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
});
await new Promise((r) => upstash.listen(0, '127.0.0.1', r));

// ── provedores de IA falsos ──
const RESPOSTA = 'Resposta de teste com algumas frases, sem nada guardado. '.repeat(4);
const ia = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  if (req.url.startsWith('/an/')) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { usage: { input_tokens: 50, cache_read_input_tokens: 7000, output_tokens: 1 } } });
    ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: RESPOSTA } });
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 50, cache_read_input_tokens: 7000, output_tokens: 60 } });
    ev({ type: 'message_stop' }); return res.end();
  }
  if (!body.stream) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ choices: [{ message: { content: 'NAO' } }], usage: { prompt_tokens: 300, completion_tokens: 2 }, cost: { usd: 0.0001 } })); }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: RESPOSTA } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 4300, completion_tokens: 60 }, cost: { usd: 0.0008 } })}\n\ndata: [DONE]\n\n`);
  res.end();
});
await new Promise((r) => ia.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${ia.address().port}`;

const realFetch = globalThis.fetch;
const permitidos = [base, `http://127.0.0.1:${upstash.address().port}`];
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return permitidos.some((p) => u.startsWith(p)) ? realFetch(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|PLUS_CODES|APP_SPEND|MONTHLY|OU_|OPENROUTER|CLAUDE|ANTHROPIC|VENICE|FREE_|PAINEL_|LOCAL_|SEARCH_|ROUTER_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${upstash.address().port}`, UPSTASH_REDIS_REST_TOKEN: 'falso',
  CLAUDE_KEY: 'falsa', OU_API_KEY: 'falsa', OPENROUTER_API_KEY: 'falsa', PRO_CODES: 'PRO-A', ADMIN_CODES: 'DONO-TESTE', ACCESS_SECRET: 'segredo-de-teste',
  ANTHROPIC_BASE_URL: `${base}/an`, OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_BASE_URL: `${base}/or/api/v1`,
  LOCAL_LLM_URL: `${base}/local`, LOCAL_LLM_TOKEN: 'falso', LOCAL_FREE_MODEL: 'local:gptoss20b',
});
const { app } = await import(`${dir}/app.js`);

let ip = 10;
async function mede(nome, chave, modelo) {
  ip += 1;
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ip}`, 'x-451-client': `aparelho${ip}`, 'user-agent': 'teste', ...(chave ? { 'x-451-key': chave } : {}) };
  contagem = 0;
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: 'Explique em duas frases o que é um firewall.' }] }) }));
  const txt = await r.text();
  await sleep(300); // gravações sem await terminam
  const chat = contagem;
  contagem = 0;
  await (await app.fetch(new Request('http://local/api/me', { headers }))).text();
  const me = contagem;
  return { nome, http: r.status, respondeu: txt.includes('event: done'), chat, me, total: chat + me };
}
const resultados = [];
for (const [n, k, m] of [
  ['grátis, Titan (Claude na frente)', null, 'nousresearch/hermes-4-405b'],
  ['grátis, Rapid (Claude na frente)', null, 'zai-org/glm-5.3-flash-uncensored'],
  ['grátis, gpt-oss local', null, 'local:gptoss20b'],
  ['Pro, Rapid', 'PRO-A', 'zai-org/glm-5.3-flash-uncensored'],
  ['admin, Max', 'DONO-TESTE', 'claude-sonnet-5-5'],
]) { await sleep(3300); const r = await mede(n, k, m); resultados.push(r); console.log(`- ${n}: HTTP ${r.http}${r.respondeu ? '' : ' (sem resposta)'} | /api/chat ${r.chat} comandos | /api/me ${r.me} | por mensagem ${r.total}`); }
contagem = 0;
const pr = await app.fetch(new Request('http://local/api/admin/painel', { headers: { 'x-451-key': 'DONO-TESTE' } }));
const painel = await pr.json();
console.log(`- leitura do painel (admin): ${contagem} comandos | tem "geral": ${painel.geral ? 'sim' : 'não'} | mensagens: ${(painel.mensagens || []).length}`);
console.log('comandos por tipo (total do teste):', JSON.stringify(porComando));
const guardado = JSON.stringify([...db.entries()].map(([k, e]) => [k, e.v instanceof Map ? [...e.v.entries()] : e.v instanceof Set ? [...e.v] : e.v]));
console.log(`texto de conversa no Redis: ${/firewall|Resposta de teste/i.test(guardado) ? 'SIM' : 'nenhum'}`);
if (saida) writeFileSync(saida, JSON.stringify({ resultados, geral: painel.geral || null }, null, 1));
upstash.close(); ia.close();
process.exit(0);
