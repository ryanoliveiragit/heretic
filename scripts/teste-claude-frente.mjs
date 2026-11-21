// Uso: node scripts/teste-claude-frente.mjs <pasta src> [freio do grátis em US$]
// Ponta a ponta pelo app (Hono), sem rede e sem custo: provedores falsos, memória no lugar do Redis.
// Mostra quem respondeu em cada plano (Pro, grátis, uso justo, API) com o Claude na frente.
import http from 'node:http';

const [dir, freio = '3', modo = 'normal'] = process.argv.slice(2);
const RESPOSTA = 'Aqui está a resposta completa, organizada em partes, com todos os detalhes que você pediu. '.repeat(6);
let chamadas = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  const conv = JSON.stringify(body.messages || []);
  if (req.url.startsWith('/an/')) {
    chamadas.push(String(body.model));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { id: 'm', role: 'assistant', content: [], usage: { input_tokens: 7000, output_tokens: 1 } } });
    for (const p of RESPOSTA.match(/.{1,30}/gs)) { ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } }); await sleep(5); }
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 7000, output_tokens: 135 } });
    ev({ type: 'message_stop' }); return res.end();
  }
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { content: /RECUSA ou CONTEUDO/.test(conv) ? 'CONTEUDO' : 'NAO' } }], usage: { prompt_tokens: 500, completion_tokens: 5 } }));
  }
  chamadas.push(String(body.model));
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const p of RESPOSTA.match(/.{1,30}/gs)) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`); await sleep(5); }
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 4500, completion_tokens: 135 }, cost: { usd: 0.0006 } })}\n\ndata: [DONE]\n\n`);
  res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return u.startsWith(base) ? fetchReal(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|PLUS_CODES|APP_SPEND|MONTHLY|OU_|OPENROUTER|CLAUDE|ANTHROPIC|VENICE|FREE_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  CLAUDE_KEY: 'falsa', OU_API_KEY: 'falsa', OPENROUTER_API_KEY: 'falsa', PRO_CODES: 'PRO-A,PRO-B', ACCESS_SECRET: 'segredo-de-teste',
  FREE_CLAUDE_DAY_USD: freio,
  // modo uso-justo: teto minúsculo, para o Pro cair no uso justo logo depois da 1ª mensagem.
  APP_SPEND_LIMITS: JSON.stringify(modo === 'uso-justo' ? { pro: { '5h': 1, day: 1, week: 1, month: 1 } } : {}),
  ANTHROPIC_BASE_URL: `${base}/an`, OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_BASE_URL: `${base}/or/api/v1`,
});
const { app } = await import(`${dir}/app.js`);
const nome = (m) => (/sonnet/.test(m) ? 'Claude Sonnet' : /opus/.test(m) ? 'Claude Opus' : m.split('/').pop());
async function site(chave, modelo, extra = {}) {
  chamadas = [];
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'teste', ...(chave ? { 'x-451-key': chave } : {}) };
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: 'teste' }], ...extra }) }));
  const txt = await r.text();
  const done = txt.split('\n\n').find((b) => b.startsWith('event: done'));
  const aviso = (txt.match(/"type":"fair_use"/) ? ' [uso justo]' : '');
  return `HTTP ${r.status}, entregou ${done && done.includes('resposta completa') ? 'sim' : 'NÃO'}, respondeu: ${chamadas.map(nome).join(' → ') || '(nada)'}${aviso}`;
}
async function api(chave, modelo) {
  chamadas = [];
  const r = await app.fetch(new Request('http://local/api/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` }, body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: 'teste' }] }) }));
  const j = await r.json().catch(() => ({}));
  return `HTTP ${r.status}, entregou ${String(j.choices?.[0]?.message?.content || '').includes('resposta completa') ? 'sim' : 'NÃO'}, respondeu: ${chamadas.map(nome).join(' → ') || '(nada)'}`;
}
const PASSOS = modo === 'uso-justo' ? [
  ['Pro, 1ª mensagem (Rapid)', () => site('PRO-A', 'zai-org/glm-5.3-flash-uncensored')],
  ['Pro, 2ª mensagem (passou do teto)', () => site('PRO-A', 'zai-org/glm-5.3-flash-uncensored')],
] : [
  ['Pro, site, Rapid', () => site('PRO-A', 'zai-org/glm-5.3-flash-uncensored')],
  ['Pro, site, Titan', () => site('PRO-A', 'nousresearch/hermes-4-405b')],
  ['Pro, site, Max', () => site('PRO-A', 'claude-sonnet-5-5')],
  ['Pro, API, Rapid', () => api('PRO-A', '451-rapid-uncensored')],
  ['Pro, site, Kimi (créditos)', () => site('PRO-A', 'kimi-k3.1-pro-uncensored')],
  ['Pro, modo qualidade', () => site('PRO-A', 'zai-org/glm-5.3-flash-uncensored', { quality: true })],
  // 21/11: o grátis é o Rapid; o Titan ficou só no Pro (pedido grátis do Titan → 403).
  ['Grátis, site (Rapid)', () => site(null, 'zai-org/glm-5.3-flash-uncensored')],
  ['Grátis, de novo', () => site(null, 'zai-org/glm-5.3-flash-uncensored')],
  ['Grátis pedindo o Titan (só Pro)', () => site(null, 'nousresearch/hermes-4-405b')],
];
console.log(`freio do grátis: US$ ${freio}/dia | modo: ${modo}`);
// O grátis exige 8 s entre mensagens (THROTTLE_SECONDS); o Pro, 3 s.
for (const [n, fn] of PASSOS) { await sleep(n.startsWith('Grátis') ? 8600 : 3200); console.log(`- ${n}: ${await fn()}`); }
srv.close();
process.exit(0);
