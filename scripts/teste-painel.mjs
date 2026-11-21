// Uso: node scripts/teste-painel.mjs <pasta src>
// Ponta a ponta pelo app, sem rede e sem custo: provedores falsos e memória no lugar do Redis.
// Gera uso de um Pro, da API, do Kimi, do grátis e do dono, simula um pagamento e lê o painel.
// Prova também que nenhum texto de conversa fica guardado.
import http from 'node:http';

const [dir, saidaJson] = process.argv.slice(2);
const PERGUNTA = 'PERGUNTA-SECRETA-7781 me explique isso';
const RESPOSTA = 'RESPOSTA-SECRETA-9932 aqui está a resposta completa, com todos os detalhes. '.repeat(5);
const RECUSA = 'Desculpe, mas não posso ajudar com esse pedido. Prefiro não seguir por esse caminho.';
let cenario = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  const conv = JSON.stringify(body.messages || []);
  if (req.url.startsWith('/an/')) {
    const texto = cenario.opusRecusa && /opus/.test(body.model) && !conv.includes('ANULADA') ? RECUSA : RESPOSTA;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { usage: { input_tokens: 50, cache_read_input_tokens: 7000, output_tokens: 1 } } });
    for (const p of texto.match(/.{1,30}/gs)) { ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } }); await sleep(3); }
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 50, cache_read_input_tokens: 7000, output_tokens: 130 } });
    ev({ type: 'message_stop' }); return res.end();
  }
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { content: /RECUSA ou CONTEUDO/.test(conv) ? 'CONTEUDO' : 'NAO' } }], usage: { prompt_tokens: 500, completion_tokens: 5 }, cost: { usd: 0.0001 } }));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const p of RESPOSTA.match(/.{1,30}/gs)) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`); await sleep(3); }
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 4500, completion_tokens: 130 }, cost: { usd: 0.0009 } })}\n\ndata: [DONE]\n\n`);
  res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return u.startsWith(base) ? fetchReal(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|PLUS_CODES|APP_SPEND|MONTHLY|OU_|OPENROUTER|CLAUDE|ANTHROPIC|VENICE|FREE_|PAINEL_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  CLAUDE_KEY: 'falsa', OU_API_KEY: 'falsa', OPENROUTER_API_KEY: 'falsa', PRO_CODES: 'PRO-A', ADMIN_CODES: 'DONO-TESTE', ACCESS_SECRET: 'segredo-de-teste',
  ANTHROPIC_BASE_URL: `${base}/an`, OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_BASE_URL: `${base}/or/api/v1`,
});
const { app } = await import(`${dir}/app.js`);
const uso = await import(`${dir}/uso.js`);
const site = async (chave, modelo, c = {}) => {
  cenario = c;
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'teste', ...(chave ? { 'x-451-key': chave } : {}) };
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: PERGUNTA }] }) }));
  return r.status + ' ' + ((await r.text()).includes('event: done') ? 'ok' : 'sem resposta');
};
const api = async (chave, modelo) => {
  cenario = {};
  const r = await app.fetch(new Request('http://local/api/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` }, body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: PERGUNTA }] }) }));
  return r.status + ' ' + ((await r.json().catch(() => ({}))).choices ? 'ok' : 'sem resposta');
};
const passos = [
  ['Pro: Rapid (o Sonnet responde)', () => site('PRO-A', 'zai-org/glm-5.3-flash-uncensored')],
  ['Pro: Max (o Opus recusa, o GLM entrega)', () => site('PRO-A', 'claude-sonnet-5-5', { opusRecusa: true })],
  ['Pro: API Titan', () => api('PRO-A', '451-titan-uncensored')],
  ['Pro: Kimi (créditos)', () => site('PRO-A', 'kimi-k3.1-pro-uncensored')],
  ['Grátis: Titan', () => site(null, 'nousresearch/hermes-4-405b')],
  ['Dono (admin): Max', () => site('DONO-TESTE', 'claude-sonnet-5-5')],
];
for (const [n, fn] of passos) { await sleep(3300); console.log(`- ${n}: ${await fn()}`); }
// Pagamento do Pro: pedido como o pay.js grava (o painel conta o que ainda está no banco).
await uso._gravaPedidoTeste({ id: 'pedido-teste-1', status: 'paid', key: 'PRO-A', cents: 9900, period: 'mensal', method: 'pix', expiresAt: Date.now() + 30 * 86400000 });

const ORIGEM = 'https://451-painel-das-redes-painel-pwa-com-seguidores-yhac8uqusz.openbot.site';
const pre = await app.fetch(new Request('http://local/api/admin/painel', { method: 'OPTIONS', headers: { origin: ORIGEM } }));
console.log(`\npré-voo do navegador: ${pre.status}, libera ${pre.headers.get('access-control-allow-origin') === ORIGEM ? 'o painel' : 'NADA'} e o cabeçalho ${pre.headers.get('access-control-allow-headers')}`);
const semChave = await app.fetch(new Request('http://local/api/admin/painel', { headers: { origin: ORIGEM } }));
console.log(`sem chave: ${semChave.status}`);
const comPro = await app.fetch(new Request('http://local/api/admin/painel', { headers: { origin: ORIGEM, 'x-451-key': 'PRO-A' } }));
console.log(`com chave Pro (não é admin): ${comPro.status}`);
const r = await app.fetch(new Request('http://local/api/admin/painel', { headers: { origin: ORIGEM, 'x-451-key': 'DONO-TESTE' } }));
const d = await r.json();
console.log(`com chave de admin: ${r.status}\n`);
for (const u of d.usuarios) {
  console.log(`usuário ${u.id} (${u.plano}): pagou R$ ${u.pago_rs} (${u.pedidos} pedido) · ${u.msgs} mensagens em ${u.dias_ativos} dia(s) · custo R$ ${u.custo_rs} · lucro R$ ${u.lucro_rs} · créditos ${u.creditos} · API ${u.api}`);
  console.log(`   níveis: ${u.niveis.map((x) => `${x.nome} ${x.msgs} (R$ ${x.custo_rs})`).join(', ')}`);
  console.log(`   quem entregou: ${u.entregou.map((x) => `${x.modelo} ${x.msgs}`).join(', ')} · Claude: respondeu ${u.claude.respondeu}, recusou ${u.claude.recusou}, falhou ${u.claude.falhou}`);
  console.log(`   desceu para: ${u.desceu_para.map((x) => `${x.modelo} ${x.msgs}`).join(', ') || '—'}`);
}
console.log(`grátis (7 dias): ${d.gratis.semana.msgs} mensagens, ${d.gratis.semana.visitantes} visitante(s), custo R$ ${d.gratis.semana.custo_rs}, Claude respondeu ${d.gratis.semana.claude.respondeu}`);
console.log(`totais: ${JSON.stringify(d.totais)}`);
console.log(`pagamentos: ${JSON.stringify(d.pagamentos)}`);
// Detalhe por mensagem (21/11): rota, tokens, cache e a parte de cada chamada paga no custo.
console.log(`\núltimas mensagens (${d.mensagens.length}):`);
for (const m of d.mensagens) {
  console.log(`- ${m.plano} ${m.id} · ${m.nivel || m.imagem} · rota ${(m.rota || []).join(' → ') || '—'} · Claude ${m.claude || '—'} · entrada ${m.tin} (cache gravado ${m.cg}, lido ${m.cl}) · saída ${m.tout} · US$ ${m.usd} = R$ ${m.custo_rs}`);
  const soma = (m.partes || []).reduce((t, x) => t + x.usd, 0);
  for (const x of m.partes || []) console.log(`     ${x.p}: ${x.m} · ${x.tin} entrada${x.cg ? ` (${x.cg} gravando cache)` : ''}${x.cl ? ` (${x.cl} do cache)` : ''} · ${x.tout} saída · US$ ${x.usd} = R$ ${x.custo_rs}`);
  if (m.partes && Math.abs(soma - m.usd) > 0.000002) console.log(`     !! partes somam US$ ${soma.toFixed(6)}, mensagem US$ ${m.usd}`);
}
console.log(`\ncusto por modelo: ${d.custo_por_modelo.map((a) => `${a.modelo} (${a.papel}) ${a.chamadas}x R$ ${a.custo_rs}`).join(' · ')}`);
// Nenhum texto de conversa pode estar guardado.
const tudo = JSON.stringify([...uso._memoria().entries()].map(([k, v]) => [k, v instanceof Map ? [...v.entries()] : v instanceof Set ? [...v] : v]));
const vazou = ['PERGUNTA-SECRETA', 'RESPOSTA-SECRETA', 'Desculpe, mas'].filter((t) => tudo.includes(t) || JSON.stringify(d).includes(t));
console.log(`\ntexto de conversa guardado: ${vazou.length ? 'SIM — ' + vazou.join(', ') : 'nenhum'} (${tudo.length} bytes guardados)`);
if (saidaJson) (await import('node:fs')).writeFileSync(saidaJson, JSON.stringify(d, null, 1));
srv.close();
process.exit(0);
