// Uso: node scripts/teste-painel-niveis.mjs <pasta src> [saída.json]
// Painel novo (pedido do Redesig geral, 21/11), sem rede e sem custo: provedores falsos e memória no lugar do Redis.
// Gera mensagens em vários níveis × planos (inclusive o 451 Free local), uma falha, a intenção de imagem e a dica do
// agente, e confere no GET /api/admin/painel: geral.*.niveis, apoio, fornecedores, tempos, ms e fornecedor por
// parte nas mensagens e o catálogo precos.niveis / precos.apoio.
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const [dir, saidaJson] = process.argv.slice(2);
const RESPOSTA = 'Aqui está a resposta completa, com todos os detalhes pedidos. '.repeat(4);
const RECUSA = 'Desculpe, mas não posso ajudar com esse pedido. Prefiro não seguir por esse caminho.';
let cenario = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  const conv = JSON.stringify(body.messages || []);
  if (cenario.quebra && !req.url.startsWith('/local/')) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":"falso"}'); }
  if (req.url.startsWith('/an/')) {
    const texto = cenario.opusRecusa && /opus/.test(body.model) && !conv.includes('ANULADA') ? RECUSA : RESPOSTA;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { usage: { input_tokens: 50, cache_read_input_tokens: 7000, output_tokens: 1 } } });
    for (const p of texto.match(/.{1,30}/gs)) { ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } }); await sleep(3); }
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 50, cache_read_input_tokens: 7000, output_tokens: 130 } });
    ev({ type: 'message_stop' }); return res.end();
  }
  if (req.url.startsWith('/local/')) { // 451 Free (gpt-oss local)
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const p of RESPOSTA.match(/.{1,30}/gs)) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`); await sleep(3); }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 4300, completion_tokens: 60 } })}\n\ndata: [DONE]\n\n`);
    return res.end();
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
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|PLUS_CODES|APP_SPEND|MONTHLY|OU_|OPENROUTER|CLAUDE|ANTHROPIC|VENICE|FREE_|PAINEL_|LOCAL_|SEARCH_|THROTTLE)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  CLAUDE_KEY: 'falsa', OU_API_KEY: 'falsa', OPENROUTER_API_KEY: 'falsa', PRO_CODES: 'PRO-A', ADMIN_CODES: 'DONO-TESTE', ACCESS_SECRET: 'segredo-de-teste',
  ANTHROPIC_BASE_URL: `${base}/an`, OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_BASE_URL: `${base}/or/api/v1`,
  LOCAL_LLM_URL: `${base}/local`, LOCAL_LLM_TOKEN: 'falso', LOCAL_FREE_MODEL: 'local:gptoss20b', THROTTLE_SECONDS: '1',
});
const { app } = await import(`${dir}/app.js`);
let ip = 10;
const site = async (chave, modelo, c = {}, texto = 'Me explique como funciona um roteador doméstico.') => {
  cenario = c;
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ip++}`, 'x-451-client': `aparelho-${ip}`, 'user-agent': 'teste', ...(chave ? { 'x-451-key': chave } : {}) };
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: texto }] }) }));
  const t = await r.text();
  return `${r.status} ${t.includes('event: done') ? 'respondeu' : t.includes('event: error') ? 'erro' : 'sem resposta'}`;
};
const post = async (rota, corpo, chave) => {
  cenario = {};
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ip++}`, 'user-agent': 'teste', ...(chave ? { 'x-451-key': chave } : {}) };
  const r = await app.fetch(new Request(`http://local${rota}`, { method: 'POST', headers, body: JSON.stringify(corpo) }));
  return `${r.status}`;
};
const passos = [
  ['Pro: Rapid (o Sonnet responde)', () => site('PRO-A', 'zai-org/glm-5.3-flash-uncensored')],
  ['Pro: Max (o Opus recusa, o GLM entrega)', () => site('PRO-A', 'claude-sonnet-5-5', { opusRecusa: true })],
  ['Grátis: Rapid', () => site(null, 'zai-org/glm-5.3-flash-uncensored')],
  ['Grátis: 451 Free (local)', () => site(null, 'local:gptoss20b')],
  ['Pro: Titan com todos os provedores fora (falha)', () => site('PRO-A', 'nousresearch/hermes-4-405b', { quebra: true })],
  ['Grátis: intenção de imagem', () => post('/api/image/intent', { text: 'gere uma imagem de um gato astronauta' })],
  ['Pro: dica do agente', () => post('/api/agent/tip', { question: 'Como faço um scan de portas?', answer: 'Use o nmap com -sV.' }, 'PRO-A')],
];
for (const [n, fn] of passos) { await sleep(3300); console.log(`- ${n}: ${await fn()}`); } // o Pro tem intervalo mínimo entre pedidos

const r = await app.fetch(new Request('http://local/api/admin/painel', { headers: { 'x-451-key': 'DONO-TESTE' } }));
const d = await r.json();
if (saidaJson) writeFileSync(saidaJson, JSON.stringify(d, null, 2));
const dia = d.geral.dias[0];
const us = (micro) => `US$ ${(micro / 1e6).toFixed(4)}`;
console.log(`\npainel: HTTP ${r.status}`);
console.log('geral.dias[0].niveis:');
for (const [nivel, planos] of Object.entries(dia.niveis)) {
  for (const [pl, b] of Object.entries(planos)) {
    if (pl === 'todos') continue;
    console.log(`  ${nivel} × ${pl}: ${b.msgs} msg, ${b.erros} erro, ${b.canceladas} cancel. · ${us(b.custo_micro)} · fornecedores ${JSON.stringify(b.fornecedores)} · claude ${JSON.stringify(b.claude)} · repasse ${JSON.stringify(b.repasse)} · tokens ${JSON.stringify(b.tokens)} · buscas ${b.buscas} · soma_ms ${b.soma_ms}`);
  }
}
console.log('apoio:', JSON.stringify(dia.apoio));
console.log('fornecedores do dia:', JSON.stringify(dia.fornecedores));
console.log('grupos (formato antigo):', JSON.stringify(Object.fromEntries(Object.entries(dia.grupos).map(([k, v]) => [k, v.msgs]))), '| planos:', JSON.stringify(Object.fromEntries(Object.entries(dia.planos).map(([k, v]) => [k, v.msgs]))));
console.log('tempos_recentes:', JSON.stringify(d.tempos_recentes));
const m0 = d.mensagens.find((m) => m.nivel === 'Max');
console.log('mensagem do Max: ms', m0?.ms, '| partes', JSON.stringify((m0?.partes || []).map((x) => `${x.p}:${x.m}[${x.f}] ${x.ms ?? '?'}ms`)));
const falha = d.mensagens.find((m) => m.erro);
console.log('mensagem com erro:', falha ? `${falha.nivel} ${falha.plano} erro=${falha.erro} ms=${falha.ms} US$ ${falha.usd}` : 'nenhuma');
console.log('\nprecos.niveis:');
for (const n of d.precos.niveis) console.log(`  ${n.nivel.padEnd(16)} ${n.nome.padEnd(18)} planos ${n.planos.join('/').padEnd(14)} grátis/dia ${String(n.limite_gratis_dia).padEnd(4)} créditos ${n.creditos ? 'sim' : 'não'} · motor ${n.motor} → reserva ${n.reserva.join(' → ') || '—'} · ${n.fornecedores.join(', ')}${n.apelidos.length ? ` · apelidos ${n.apelidos.join(', ')}` : ''}`);
console.log('precos.apoio:', d.precos.apoio.map((a) => `${a.papel}: ${a.ordem.map((x) => `${x.modelo}[${x.fornecedor}]`).join(' → ')}`).join(' | '));

// conferências
let falhas = 0;
const confere = (ok, msg) => { if (!ok) falhas++; console.log(`${ok ? 'ok ' : 'FALHOU'} ${msg}`); };
const nv = (n, p) => dia.niveis?.[n]?.[p];
console.log('');
confere(nv('Rapid', 'pro')?.msgs === 1 && nv('Rapid', 'pro')?.claude.respondeu === 1, 'Rapid × pro: 1 mensagem, o Claude respondeu');
confere(nv('Max', 'pro')?.claude.recusou === 1 && nv('Max', 'pro')?.repasse['GLM 5.3'] === 1, 'Max × pro: o Claude recusou e repassou para o GLM 5.3');
confere(nv('Rapid', 'free')?.msgs === 1 && nv('Free', 'free')?.msgs === 1, 'grátis separado por nível: Rapid 1 e Free 1');
confere(nv('Free', 'free')?.custo_micro >= 0 && !(nv('Free', 'free')?.fornecedores?.anthropic), '451 Free sem custo de Claude numa conversa sem busca');
confere(nv('Titan', 'pro')?.erros === 1 && nv('Titan', 'pro')?.msgs === 0, 'falha conta como erro, não como mensagem');
confere(nv('Rapid', 'pro')?.fornecedores?.anthropic > 0 && nv('Rapid', 'pro')?.fornecedores?.openuncensored > 0, 'Rapid × pro com custo por fornecedor (anthropic e openuncensored)');
confere(nv('Rapid', 'pro')?.soma_ms > 0 && nv('Rapid', 'pro')?.tokens.cl > 0, 'tempo e tokens (cache lido) no bloco');
confere(dia.apoio?.intencao_imagem?.free?.chamadas === 1 && dia.apoio.intencao_imagem.free.custo_micro > 0, 'intenção de imagem entra no apoio com custo');
confere(dia.apoio?.dica_agente?.pro?.chamadas === 1 && dia.apoio.dica_agente.pro.custo_micro > 0, 'dica do agente entra no apoio com custo');
confere(Object.keys(dia.apoio?.dica_agente?.pro?.fornecedores || {}).join() === 'openuncensored', `dica do agente sem busca paga (só GLM na OpenUncensored: ${JSON.stringify(dia.apoio?.dica_agente?.pro?.fornecedores)})`);
confere(dia.grupos?.['Grátis']?.msgs === 2 && dia.planos?.free?.msgs === 2, 'visões antigas (grupos e planos) continuam somando');
const somaNiveis = Object.values(dia.niveis).reduce((t, p) => t + p.todos.custo_micro, 0) + Object.values(dia.apoio).reduce((t, p) => t + Object.values(p).reduce((a, b) => a + b.custo_micro, 0), 0);
const somaForn = Object.values(dia.fornecedores).reduce((t, v) => t + v, 0);
confere(Math.abs(somaNiveis - somaForn) <= 2, `custo dos níveis + apoio = custo por fornecedor (${us(somaNiveis)} × ${us(somaForn)})`);
confere(d.mensagens.filter((m) => !m.imagem).every((m) => m.ms > 0 && (m.partes || []).every((x) => x.f)), 'toda mensagem tem ms e toda parte tem fornecedor');
const cat = Object.fromEntries(d.precos.niveis.map((n) => [n.nivel, n]));
confere(cat.Free?.limite_gratis_dia === null && cat.Rapid?.limite_gratis_dia === 15 && cat.Titan?.limite_gratis_dia === 0, 'limites: Free sem limite, Rapid 15/dia, Titan fora do grátis');
confere(cat.Kimi?.creditos && cat.Hermes?.creditos && !cat.Rapid?.creditos, 'Kimi e Hermes com créditos');
confere(cat.Free?.apelidos?.includes('gpt-oss-20b Heretic') && cat.Free?.fornecedores?.join() === 'local', 'Free com os apelidos antigos e fornecedor local');
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
srv.close();
process.exit(falhas ? 1 : 0);
