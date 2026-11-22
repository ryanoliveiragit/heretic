// Uso: node scripts/teste-continuar.mjs <pasta src>
// Resposta cortada pelo tamanho (dono 21/11, "parou de escrever e não falou nada"), sem rede e sem custo: o modelo local
// e o Claude falsos param por tamanho; a resposta tem de terminar com o cartão "Continue de onde parou". Depois, o toque
// "Continue de onde parou" não pode buscar de novo e o modelo recebe a nota de continuação.
import http from 'node:http';

const dir = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vistos = { buscas: 0, sistemaLocal: '', sistemaClaude: '' };
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  if (req.url.startsWith('/an/')) {
    if (body.tools?.some((t) => String(t.type).startsWith('web_search'))) { vistos.buscas++; res.writeHead(500); return res.end('{}'); }
    vistos.sistemaClaude = JSON.stringify(body.system || '');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 1 } } });
    for (const p of 'Primeira parte da resposta longa, que vai ser cortada no meio de uma tabela'.match(/.{1,20}/g)) ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } });
    ev({ type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 2000 } });
    ev({ type: 'message_stop' }); return res.end();
  }
  if (req.url.startsWith('/local/')) {
    vistos.sistemaLocal = String(body.messages?.[0]?.content || '');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const p of 'Começo da resposta local que passa do tamanho e para aqui'.match(/.{1,9}/g)) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 4000, completion_tokens: 2000 } })}\n\ndata: [DONE]\n\n`);
    return res.end();
  }
  if (req.url.startsWith('/ou/')) { // classificador de busca: diz que precisa buscar
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { content: 'SIM' } }], usage: { prompt_tokens: 50, completion_tokens: 1 }, cost: { usd: 0.00002 } }));
  }
  if (req.url.startsWith('/or/')) { vistos.buscas++; res.writeHead(500); return res.end('{}'); }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return u.startsWith(base) ? realFetch(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|OU_|OPENROUTER|CLAUDE|ANTHROPIC|FREE_|LOCAL_|SEARCH_|THROTTLE)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  ANTHROPIC_API_KEY: 'falsa', ANTHROPIC_BASE_URL: `${base}/an`, OU_API_KEY: 'falsa', OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_API_KEY: 'falsa', OPENROUTER_BASE_URL: `${base}/or/api/v1`,
  LOCAL_LLM_URL: `${base}/local`, LOCAL_LLM_TOKEN: 'falso', LOCAL_FREE_MODEL: 'local:gptoss20b', ACCESS_SECRET: 'segredo-de-teste', THROTTLE_SECONDS: '1',
});
const { app } = await import(`${dir}/app.js`);
let n = 40;
async function manda(modelo, mensagens) {
  await sleep(1300);
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${n++}`, 'x-451-client': `aparelho-${n}`, 'user-agent': 'teste' };
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: modelo, messages: mensagens }) }));
  const txt = await r.text();
  const done = txt.split('\n\n').map((b) => { const ev = /event: (\w+)/.exec(b)?.[1]; let j = null; try { j = JSON.parse(/data: (.*)/s.exec(b)?.[1]); } catch { /* */ } return { ev, j }; }).find((e) => e.ev === 'done')?.j?.content || '';
  return done;
}
let falhas = 0;
const confere = (ok, msg) => { if (!ok) falhas++; console.log(`${ok ? 'ok ' : 'FALHOU'} ${msg}`); };
const CARTAO = /```ask\nA resposta chegou ao tamanho máximo e parou aqui\. Quer que eu continue\?\n- Continue de onde parou\n```/;
const r1 = await manda('local:gptoss20b', [{ role: 'user', content: 'Qual a cotação do dólar hoje e um guia longo de investimento?' }]);
confere(CARTAO.test(r1), `451 Free cortado por tamanho termina com o cartão de continuar (${JSON.stringify(r1.slice(-120))})`);
const buscasAntes = vistos.buscas;
const r2 = await manda('local:gptoss20b', [{ role: 'user', content: 'Qual a cotação do dólar hoje e um guia longo de investimento?' }, { role: 'assistant', content: r1 }, { role: 'user', content: 'Continue de onde parou' }]);
confere(vistos.buscas === buscasAntes, `"Continue de onde parou" no 451 Free não busca de novo (buscas ${buscasAntes} → ${vistos.buscas})`);
confere(/CONTINUAÇÃO: a sua resposta anterior foi cortada/.test(vistos.sistemaLocal), 'o modelo local recebe a nota de continuação');
const r3 = await manda('zai-org/glm-5.3-flash-uncensored', [{ role: 'user', content: 'Escreva um relatório longo de pentest.' }]);
confere(CARTAO.test(r3), `Rapid (Claude) cortado por tamanho termina com o cartão (${JSON.stringify(r3.slice(-100))})`);
const r4 = await manda('zai-org/glm-5.3-flash-uncensored', [{ role: 'user', content: 'Escreva um relatório longo de pentest.' }, { role: 'assistant', content: r3 }, { role: 'user', content: 'Continue de onde parou' }]);
confere(/CONTINUA[ÇC]ÃO/.test(vistos.sistemaClaude), 'o Claude recebe a nota de continuação');
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
srv.close();
process.exit(falhas ? 1 : 0);
