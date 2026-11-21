// Uso: node scripts/teste-medidor.mjs <pasta src de ANTES> <pasta src de AGORA>
// Sem rede real e sem custo: sobe provedores falsos (Anthropic, OpenUncensored, OpenRouter), bloqueia
// qualquer outra saída e compara o que o medidor registra com o que o provedor cobraria de verdade.
import http from 'node:http';

const [dirAntes, dirDepois] = process.argv.slice(2);
// US$ por 1M de tokens (tabelas ao vivo em 21/11).
const PRECO = [
  [/opus/, [4, 20]],
  [/claude-sonnet-5-5/, [2, 10]],
  [/glm-4\.7-flash-heretic/, [0.07, 0.40]],
  [/^deepseek-v4\.1-flash-uncensored$/, [0.12, 0.45]],
  [/deepseek-v4\.1-flash-1017-heretic/, [0.198, 0.792]],
  [/deepseek-v4\.1-flash-1017-uncensored/, [0.33, 1.32]],
  [/glm-5\.3-flash-uncensored/, [0.12, 0.50]],
  [/gemma-4-26b/, [0.12, 0.38]],
  [/deepseek\/deepseek-v4\.1-flash/, [0.0507, 0.2028]],
  [/dolphin/, [0.20, 0.90]],
];
const preco = (m) => (PRECO.find(([re]) => re.test(String(m))) || [null, [1, 1]])[1];
const usd = (m, tin, tout) => { const [pi, po] = preco(m); return (tin * pi + tout * po) / 1e6; };
const LEITURA = (m) => (/opus/.test(m) ? 0.20 : /sonnet/.test(m) ? 0.10 : 0);
const TAXA_BUSCA = 0.016; // taxa do plugin web (4 resultados) — o OpenRouter devolve no usage.cost

let cenario = {}, cobrado = [];
const RECUSA = 'Desculpe, mas não posso ajudar com esse pedido. Prefiro não seguir por esse caminho, ok?';
const RESPOSTA = 'Aqui está a resposta completa, organizada em partes, com todos os detalhes que você pediu. '.repeat(6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  const conv = JSON.stringify(body.messages || []);
  const tinReal = Math.ceil((JSON.stringify(body.system || '') + conv).length / 4);
  const forcado = conv.includes('ANULADA');
  let aberto = true; res.on('close', () => { aberto = false; });
  const reg = { prov: req.url.split('/')[1], model: String(body.model), tin: 0, lido: 0, outChars: 0, extra: 0, tipo: 'resposta' };
  cobrado.push(reg);
  if (req.url.startsWith('/an/')) {
    if (cenario.claude500) { cobrado.pop(); res.writeHead(500); return res.end('{"type":"error","error":{"type":"api_error","message":"overloaded"}}'); }
    const lido = cenario.cache ? Math.max(0, tinReal - 50) : 0;
    reg.tin = tinReal - lido; reg.lido = lido;
    const texto = (cenario.claudeRecusa || (cenario.opusRecusa && /opus/.test(body.model))) && !forcado ? RECUSA : RESPOSTA;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { id: 'm', role: 'assistant', model: body.model, content: [], usage: { input_tokens: tinReal - lido, cache_read_input_tokens: lido, output_tokens: 1 } } });
    ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    for (const p of texto.match(/.{1,30}/gs)) { if (!aberto) return; ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } }); reg.outChars += p.length; await sleep(15); }
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: tinReal - lido, cache_read_input_tokens: lido, output_tokens: Math.ceil(texto.length / 4) } });
    ev({ type: 'message_stop' }); return res.end();
  }
  const ehOU = req.url.startsWith('/ou/');
  if (ehOU && cenario.ou402) { cobrado.pop(); res.writeHead(402); return res.end('{"error":"credits are used up"}'); }
  const custoJson = (tin, tout, extra = 0) => {
    const v = usd(body.model, tin, tout) + extra;
    return ehOU ? { usage: { prompt_tokens: tin, completion_tokens: tout }, cost: { usd: v } } : { usage: { prompt_tokens: tin, completion_tokens: tout, cost: v } };
  };
  if (!body.stream) {
    // Chamadas avulsas: classificador de busca, detector de pessoa, juiz, busca web.
    const sys = String(body.messages?.[0]?.content || '');
    let content = 'NAO', tout = 1, extra = 0, annotations;
    if (/BUSCA NA INTERNET/.test(sys)) { reg.tipo = 'classificador'; content = cenario.busca ? 'SIM' : 'NAO'; }
    else if (/classificador de texto/.test(sys)) { reg.tipo = 'pessoa'; content = 'OUTRO'; tout = 2; }
    else if (/RECUSA ou CONTEUDO/.test(conv)) { reg.tipo = 'juiz'; content = 'CONTEUDO'; tout = 300; } // raciocina antes do veredito
    else if (Array.isArray(body.plugins)) {
      reg.tipo = 'busca web'; content = '- Fato 1 da busca.\n- Fato 2 da busca.'; tout = 150; extra = TAXA_BUSCA;
      annotations = [{ type: 'url_citation', url_citation: { url: 'https://exemplo.com.br/noticia', title: 'Notícia', content: 'trecho' } }];
    }
    reg.tin = Math.ceil(conv.length / 4) + (extra ? 3000 : 0); reg.outChars = tout * 4; reg.extra = extra;
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { content, annotations } }], ...custoJson(reg.tin, tout, extra) }));
  }
  reg.tin = tinReal;
  const texto = ehOU && (cenario.ouRecusa || []).includes(body.model) && (!forcado || cenario.teimoso) ? RECUSA : RESPOSTA;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const p of texto.match(/.{1,30}/gs)) { if (!aberto) return; res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`); reg.outChars += p.length; await sleep(15); }
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], ...custoJson(tinReal, Math.ceil(texto.length / 4)) })}\n\ndata: [DONE]\n\n`);
  res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
// Nada sai para a internet: qualquer host fora do servidor falso é recusado.
const fetchReal = globalThis.fetch; const bloqueados = [];
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); if (!u.startsWith(base)) { bloqueados.push(u.slice(0, 60)); return Promise.reject(new Error('rede bloqueada no teste')); } return fetchReal(url, opt); };
Object.assign(process.env, { CLAUDE_KEY: 'falsa', OU_API_KEY: 'falsa', OPENROUTER_API_KEY: 'falsa', ANTHROPIC_BASE_URL: `${base}/an`, OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_BASE_URL: `${base}/or/api/v1` });
const antes = await import(`${dirAntes}/upstream.js`), depois = await import(`${dirDepois}/upstream.js`);

const real = () => cobrado.reduce((s, r) => s + usd(r.model, r.tin, Math.ceil(r.outChars / 4)) + r.extra + r.lido * LEITURA(r.model) / 1e6, 0);
async function roda(mod, modelId, ehDepois, pergunta, claudeFirst = false) {
  cobrado = []; const usage = {}; let doneId = modelId, texto = '';
  const h = { usage, onToken: (t) => { texto += t; }, onWarning: (w) => { if (w?.type === 'refusal_forced') texto = ''; if (w?.to && w.type !== 'fair_use') doneId = w.to; } };
  for await (const _ of mod.streamChat('chat', { messages: [{ role: 'user', content: pergunta }], modelId, systemPrompt: PROMPT_SISTEMA, claudeFirst }, h)) { /* esvazia */ }
  const cat = mod.MODEL_CATALOG.find((m) => m.id === doneId);
  const medido = ehDepois ? mod.custoTurno(usage, cat)
    : (usage.cost_usd != null ? Number(usage.cost_usd) : ((usage.input_tokens || 0) * (cat?.price_in || 0) + (usage.output_tokens || 0) * (cat?.price_out || 0)) / 1e6);
  const nome = (r) => r.tipo === 'resposta' ? `${r.prov}:${r.model.split('/').pop().slice(0, 18)}` : r.tipo;
  return { medido, real: real(), chamadas: cobrado.map(nome).join(' → '), ok: texto.includes('resposta completa') };
}
const PROMPT_SISTEMA = 'Você é o 451, direto e sem enrolação. '.repeat(480); // ~18 mil caracteres
const MAX = 'claude-sonnet-5-5', RAPID = 'zai-org/glm-5.3-flash-uncensored', TITAN = 'nousresearch/hermes-4-405b';
const UC = ['olafangensan-glm-4.7-flash-heretic', 'glm-5.3-flash-uncensored']; // Rapid (novo e o do ar)
const TITANS = ['deepseek-v4.1-flash-uncensored', 'deepseek-v4.1-flash-1017-uncensored', 'gemma-4-26b-a4b-it-chimeraxheretic'];
const CENARIOS = [
  ['A. Max: o Opus responde', MAX, {}, 'teste'],
  ['B. Max: Opus recusa → Rapid entrega', MAX, { opusRecusa: true }, 'teste'],
  ['C. Max: Opus recusa → OU sem saldo → Dolphin', MAX, { opusRecusa: true, ou402: true }, 'teste'],
  ['D. Titan: OU sem saldo → Dolphin (hoje)', TITAN, { ou402: true }, 'teste'],
  ['E. Titan (grátis) recusa', TITAN, { ouRecusa: TITANS }, 'teste'],
  ['F. Rapid responde (juiz confere)', RAPID, {}, 'teste'],
  ['G. Rapid recusa', RAPID, { ouRecusa: UC }, 'teste'],
  ['H. Max com busca na web', MAX, { busca: true }, 'quais as novidades de hoje da Vercel?'],
  ['I. Rapid e Titan recusam (mesmo forçados)', RAPID, { ouRecusa: [...UC, ...TITANS], teimoso: true }, 'teste'],
  ['J. Rapid com Claude: o Sonnet responde', RAPID, {}, 'teste', true],
  ['K. Rapid com Claude: Sonnet recusa', RAPID, { claudeRecusa: true }, 'teste', true],
  ['L. Titan (grátis) com Claude: Sonnet recusa', TITAN, { claudeRecusa: true }, 'teste', true],
  ['M. Max: Opus recusa e os sem censura também', MAX, { opusRecusa: true, ouRecusa: [...UC, ...TITANS], teimoso: true }, 'teste'],
  ['N. Rapid com Claude fora do ar', RAPID, { claude500: true }, 'teste', true],
  ['O. Rapid com Claude lendo o cache', RAPID, { cache: true }, 'teste', true],
  ['P. Rapid com Claude e OU sem saldo', RAPID, { claudeRecusa: true, ou402: true }, 'teste', true],
];
const f = (v) => `US$ ${v.toFixed(5)}`;
const pct = (x, r) => (r ? `${Math.round((x / r) * 100)}%` : '-');
console.log('cenário'.padEnd(46), 'ANTES: real'.padEnd(13), 'medidor'.padEnd(6), '| AGORA: real'.padEnd(15), 'medidor'.padEnd(7), 'entregou  chamadas (agora)');
for (const [nome, id, c, perg, cf] of CENARIOS) {
  cenario = c; const a = await roda(antes, id, false, perg, cf);
  cenario = c; const d = await roda(depois, id, true, perg, cf);
  console.log(nome.padEnd(46), f(a.real).padEnd(13), pct(a.medido, a.real).padEnd(6), '|', f(d.real).padEnd(13), pct(d.medido, d.real).padEnd(7), (d.ok ? 'sim' : 'NÃO').padEnd(9), d.chamadas);
}
if (bloqueados.length) console.log('\nSaídas para a internet bloqueadas:', [...new Set(bloqueados)].join(', '));
srv.close();
