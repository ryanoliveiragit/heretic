// Uso: node scripts/teste-freios.mjs <pasta src>
// Freios contra prejuízo (21/11), sem rede e sem custo: provedores falsos e memória no lugar do Redis.
// 1) créditos: o pior caso tem de caber no saldo (nunca negativo); a saída é limitada ao que o saldo paga.
// 2) grátis: passou do teto total do dia, pausa.
// 3) Pro: o histórico enviado ao modelo é cortado em 200 mil caracteres.
import http from 'node:http';

const dir = process.argv[2];
const RESPOSTA = 'Aqui está a resposta completa, com todos os detalhes que você pediu. '.repeat(4);
let ultimo = null; // o que o último modelo recebeu
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  const conv = JSON.stringify(body.messages || []);
  if (!body.stream && !req.url.startsWith('/an/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { content: /RECUSA ou CONTEUDO/.test(conv) ? 'CONTEUDO' : 'NAO' } }], usage: { prompt_tokens: 300, completion_tokens: 2 } }));
  }
  const textoUsuario = (body.messages || []).filter((m) => m.role !== 'system').reduce((t, m) => t + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
  ultimo = { modelo: body.model, max_tokens: body.max_tokens, caracteres: textoUsuario };
  if (req.url.startsWith('/an/')) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { usage: { input_tokens: 1000, output_tokens: 1 } } });
    ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: RESPOSTA } });
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 1000, output_tokens: 70 } });
    ev({ type: 'message_stop' }); return res.end();
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: RESPOSTA } }] })}\n\n`);
  // custo alto de propósito no grátis (para estourar o teto do dia na 1ª mensagem)
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 4500, completion_tokens: 70 }, cost: { usd: 0.01 } })}\n\ndata: [DONE]\n\n`);
  res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return u.startsWith(base) ? fetchReal(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|PLUS_CODES|APP_SPEND|MONTHLY|OU_|OPENROUTER|CLAUDE|ANTHROPIC|VENICE|FREE_|PAINEL_|PRO_MAX|CREDIT_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  CLAUDE_KEY: 'falsa', OU_API_KEY: 'falsa', OPENROUTER_API_KEY: 'falsa', PRO_CODES: 'PRO-A,PRO-B', ACCESS_SECRET: 'segredo-de-teste',
  FREE_DAY_USD: '0.001', // teto do dia do grátis bem baixo: a 1ª mensagem passa, a 2ª para
  ANTHROPIC_BASE_URL: `${base}/an`, OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_BASE_URL: `${base}/or/api/v1`,
});
const { app } = await import(`${dir}/app.js`);
const creditos = await import(`${dir}/credits.js`);
const { idDaChave } = await import(`${dir}/limits.js`);
const site = async (chave, modelo, mensagens, ip = '203.0.113.20') => {
  ultimo = null;
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': ip, 'user-agent': 'teste', ...(chave ? { 'x-451-key': chave } : {}) };
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: modelo, messages: mensagens }) }));
  const txt = await r.text();
  let msg = ''; try { msg = JSON.parse(txt).message || ''; } catch { /* stream */ }
  return { status: r.status, respondeu: txt.includes('event: done'), msg, ultimo };
};
const um = (t) => [{ role: 'user', content: t }];
const linha = (n, r) => console.log(`- ${n}: HTTP ${r.status}${r.respondeu ? ', respondeu' : ''}${r.msg ? ` — "${r.msg.slice(0, 110)}"` : ''}${r.ultimo ? ` | modelo recebeu ${r.ultimo.caracteres.toLocaleString('pt-BR')} caracteres, max_tokens ${r.ultimo.max_tokens}` : ''}`);

console.log('1) Créditos (Kimi), com a cota do Pro (500 créditos):');
await sleep(3300); linha('saldo cheio, pergunta curta', await site('PRO-A', 'kimi-k3.1-pro-uncensored', um('Explique rapidamente.')));
const sid = await idDaChave('PRO-B');
await creditos.creditBalance(sid, 'pro'); // recebe a cota do mês
await creditos.spendCredits(sid, 'pro', 496); // sobram 4
await sleep(3300); linha('saldo 4, pergunta curta', await site('PRO-B', 'kimi-k3.1-pro-uncensored', um('Explique rapidamente.')));
console.log(`   saldo depois: ${(await creditos.creditBalance(sid, 'pro')).total} (nunca negativo)`);
await creditos.addExtraCredits(sid, 41); // sobe para 45: dá para uma resposta curta, não para a saída cheia
await sleep(3300); linha('saldo 45: cabe a resposta inteira', await site('PRO-B', 'kimi-k3.1-pro-uncensored', um('Explique rapidamente.')));
console.log(`   saldo depois: ${(await creditos.creditBalance(sid, 'pro')).total} (nunca negativo)`);

await sleep(3300); linha('saldo 32: só cabe uma resposta mais curta', await site('PRO-B', 'kimi-k3.1-pro-uncensored', um('Explique rapidamente.')));
console.log(`   saldo depois: ${(await creditos.creditBalance(sid, 'pro')).total} (nunca negativo)`);
console.log('2) Teto total do grátis no dia (US$ 0,001 só neste teste):');
await sleep(9000); linha('grátis, 1ª mensagem', await site(null, 'nousresearch/hermes-4-405b', um('oi')));
await sleep(9000); linha('grátis, 2ª mensagem', await site(null, 'nousresearch/hermes-4-405b', um('oi de novo'), '203.0.113.21'));

console.log('3) Pro com histórico de 300 mil caracteres (Rapid):');
const historico = [];
for (let i = 0; i < 30; i++) historico.push({ role: i % 2 ? 'assistant' : 'user', content: `${i}:` + 'x'.repeat(9997) });
historico.push({ role: 'user', content: 'e agora?' });
await sleep(3300); linha('histórico longo', await site('PRO-A', 'zai-org/glm-5.3-flash-uncensored', historico));
srv.close();
process.exit(0);
