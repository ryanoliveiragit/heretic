// Uso: node scripts/teste-teto-assinante.mjs <pasta src>
// Ponta a ponta pelo app (Hono), sem rede e sem custo: provedores falsos, chave Pro de teste, memória
// no lugar do Redis. Manda mensagens que caem nos caminhos caros e mostra quanto o teto de gasto do
// assinante (o que /api/me devolve em %) subiu em cada uma.
import http from 'node:http';

const dir = process.argv[2];
const RECUSA = 'Desculpe, mas não posso ajudar com esse pedido. Prefiro não seguir por esse caminho, ok?';
const RESPOSTA = 'Aqui está a resposta completa, organizada em partes, com todos os detalhes que você pediu. '.repeat(6);
const PRECO = { opus: [5, 25], ou: [0.12, 0.5], or: [0.2, 0.9] };
let cenario = {}, cobrado = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  const conv = JSON.stringify(body.messages || []);
  const tin = Math.ceil((JSON.stringify(body.system || '') + conv).length / 4);
  const forcado = conv.includes('ANULADA');
  let aberto = true; res.on('close', () => { aberto = false; });
  if (req.url.startsWith('/an/')) {
    const texto = cenario.opusRecusa && !forcado ? RECUSA : RESPOSTA;
    let enviados = 0;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { id: 'm', role: 'assistant', content: [], usage: { input_tokens: tin, output_tokens: 1 } } });
    for (const p of texto.match(/.{1,30}/gs)) {
      if (!aberto) break;
      ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } }); enviados += p.length; await sleep(15);
    }
    cobrado += (tin * PRECO.opus[0] + Math.ceil(enviados / 4) * PRECO.opus[1]) / 1e6;
    if (!aberto) return;
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: tin, output_tokens: Math.ceil(texto.length / 4) } });
    ev({ type: 'message_stop' }); return res.end();
  }
  const ehOU = req.url.startsWith('/ou/');
  if (ehOU && cenario.ou402) { res.writeHead(402); return res.end('{"error":"credits are used up"}'); }
  const [pi, po] = ehOU ? PRECO.ou : PRECO.or;
  if (!body.stream) {
    const v = (tin * pi + 300 * po) / 1e6; cobrado += v;
    res.writeHead(200, { 'content-type': 'application/json' });
    const conteudo = /RECUSA ou CONTEUDO/.test(conv) ? 'CONTEUDO' : 'NAO';
    return res.end(JSON.stringify({ choices: [{ message: { content: conteudo } }], usage: { prompt_tokens: tin, completion_tokens: 300, ...(ehOU ? {} : { cost: v }) }, ...(ehOU ? { cost: { usd: v } } : {}) }));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const p of RESPOSTA.match(/.{1,30}/gs)) { if (!aberto) return; res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`); await sleep(10); }
  const out = Math.ceil(RESPOSTA.length / 4), v = (tin * pi + out * po) / 1e6; cobrado += v;
  const fim = ehOU ? { usage: { prompt_tokens: tin, completion_tokens: out }, cost: { usd: v } } : { usage: { prompt_tokens: tin, completion_tokens: out, cost: v } };
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], ...fim })}\n\ndata: [DONE]\n\n`); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return u.startsWith(base) ? fetchReal(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|PLUS_CODES|APP_SPEND|MONTHLY|OU_|OPENROUTER|CLAUDE|ANTHROPIC|VENICE)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  CLAUDE_KEY: 'falsa', OU_API_KEY: 'falsa', OPENROUTER_API_KEY: 'falsa', PRO_CODES: 'PRO-TESTE-MEDIDOR', ACCESS_SECRET: 'segredo-de-teste',
  ANTHROPIC_BASE_URL: `${base}/an`, OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_BASE_URL: `${base}/or/api/v1`,
});
const { app } = await import(`${dir}/app.js`);
const CHAVE = 'PRO-TESTE-MEDIDOR';
const teto = async () => {
  const r = await app.fetch(new Request('http://local/api/me', { headers: { 'x-451-key': CHAVE } }));
  const j = await r.json();
  return Object.fromEntries((j.fairUse?.windows || []).map((w) => [w.id, w.pct]));
};
async function chat(modelo, c) {
  cenario = c; cobrado = 0;
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-451-key': CHAVE }, body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: 'teste' }] }) }));
  const txt = await r.text();
  const done = txt.split('\n\n').find((b) => b.startsWith('event: done'));
  return { status: r.status, entregou: !!done && done.includes('resposta completa'), erro: txt.includes('event: error') ? txt.slice(0, 160) : '' };
}
async function api(modelo, c) {
  cenario = c; cobrado = 0;
  const r = await app.fetch(new Request('http://local/api/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${CHAVE}` }, body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: 'teste' }] }) }));
  const j = await r.json().catch(() => ({}));
  return { status: r.status, entregou: String(j.choices?.[0]?.message?.content || '').includes('resposta completa'), erro: j.error ? JSON.stringify(j.error).slice(0, 160) : '' };
}
const PASSOS = [
  ['Site: Max, o Opus recusa e o Rapid entrega', () => chat('claude-sonnet-5-5', { opusRecusa: true })],
  ['Site: Titan com a OpenUncensored sem saldo', () => chat('nousresearch/hermes-4-405b', { ou402: true })],
  ['API: Max, o Opus recusa e o Rapid entrega', () => api('451-max-uncensored', { opusRecusa: true })],
];
console.log(`versão: ${dir}`);
let antes = await teto();
console.log('teto do assinante no início (janela 5h):', `${antes['5h'] ?? 0}%`);
for (const [nome, fn] of PASSOS) {
  await sleep(3200); // respeita o intervalo mínimo do Pro entre mensagens
  const r = await fn();
  const depois = await teto();
  console.log(`- ${nome}: HTTP ${r.status}, entregou ${r.entregou ? 'sim' : 'NÃO'}, custo real US$ ${cobrado.toFixed(5)}, teto 5h ${antes['5h'] ?? 0}% → ${depois['5h'] ?? 0}%${r.erro ? ' | erro: ' + r.erro : ''}`);
  antes = depois;
}
srv.close();
process.exit(0);
