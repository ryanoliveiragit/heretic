// Uso: node scripts/teste-anthropic.mjs <pasta src>
// API compatível com a Anthropic (/v1/messages) no grátis = modelo local (gpt-oss), sem rede e sem custo. Confere a
// tradução do formato Anthropic (system, tool_result) para o interno e dos eventos internos para os eventos Anthropic
// (message_start, content_block_* de texto e de tool_use, message_delta, message_stop) no streaming e na resposta única.
import http from 'node:http';

const dir = process.argv[2];
let ultimoCorpo = null; // o que o gateway local recebeu (para conferir a tradução das mensagens/ferramentas)
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}'); ultimoCorpo = body;
  if (req.url !== '/v1/chat/completions') { res.writeHead(404); return res.end(); }
  const ultimo = JSON.stringify(body.messages?.at(-1) || {});
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const ev = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  if (body.tools?.length && /use a ferramenta|clima/i.test(ultimo)) { // pede ferramenta → devolve tool_call
    ev({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_x', function: { name: 'get_weather', arguments: '{"cidade":"SP"}' } }] } }] });
    ev({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1200, completion_tokens: 12 } });
  } else {
    for (const p of ['Uma ', 'VPN é ', 'um túnel ', 'criptografado.']) ev({ choices: [{ delta: { content: p } }] });
    ev({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1300, completion_tokens: 20 } });
  }
  ev('[DONE]'); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return u.startsWith(base) ? realFetch(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|OU_|OPENROUTER|CLAUDE|ANTHROPIC|FREE_|LOCAL_|SEARCH_|THROTTLE|FERRAMENTAS_)/.test(k)) delete process.env[k];
Object.assign(process.env, { LOCAL_LLM_URL: base, LOCAL_LLM_TOKEN: 'falso', LOCAL_FREE_MODEL: 'local:gptoss20b', ACCESS_SECRET: 'segredo', THROTTLE_SECONDS: '0' });
const { app } = await import(`${dir}/app.js`);

let n = 60;
async function manda(corpo) {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${n++}`, 'x-451-client': `cc-${n}`, 'user-agent': 'claude-code' };
  const r = await app.fetch(new Request('http://local/api/v1/messages', { method: 'POST', headers, body: JSON.stringify(corpo) }));
  const txt = await r.text();
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('event-stream')) {
    const eventos = txt.split('\n\n').map((b) => { const t = /event: (\w+)/.exec(b)?.[1]; let j = null; try { j = JSON.parse(/data: (.*)/s.exec(b)?.[1]); } catch { /* */ } return { t, j }; }).filter((e) => e.t);
    return { status: r.status, eventos };
  }
  return { status: r.status, json: JSON.parse(txt) };
}
let falhas = 0;
const ok = (c, m) => { if (!c) falhas++; console.log(`${c ? 'ok ' : 'FALHOU'} ${m}`); };

// 1) streaming de texto no grátis (sem chave) → eventos Anthropic
let r = await manda({ model: '451-free', max_tokens: 100, stream: true, system: 'Você é um assistente de código.', messages: [{ role: 'user', content: 'o que é uma VPN?' }] });
const tipos = r.eventos.map((e) => e.t);
ok(tipos[0] === 'message_start' && tipos.includes('content_block_start') && tipos.includes('content_block_delta') && tipos.at(-1) === 'message_stop', `ordem dos eventos: ${tipos.join(',')}`);
const texto = r.eventos.filter((e) => e.t === 'content_block_delta' && e.j?.delta?.type === 'text_delta').map((e) => e.j.delta.text).join('');
ok(texto === 'Uma VPN é um túnel criptografado.', `texto montado dos deltas: ${JSON.stringify(texto)}`);
const md = r.eventos.find((e) => e.t === 'message_delta');
ok(md?.j?.delta?.stop_reason === 'end_turn', `stop_reason end_turn (${md?.j?.delta?.stop_reason})`);
ok(/Você é um assistente de código\./.test(String(ultimoCorpo.messages?.[0]?.content || '')), 'o system do cliente chega ao modelo');

// 2) ferramentas: tool_use no streaming
r = await manda({ model: '451-free', max_tokens: 100, stream: true, tools: [{ name: 'get_weather', description: 'clima', input_schema: { type: 'object', properties: { cidade: { type: 'string' } } } }], messages: [{ role: 'user', content: 'use a ferramenta de clima' }] });
const tu = r.eventos.find((e) => e.t === 'content_block_start' && e.j?.content_block?.type === 'tool_use');
const ij = r.eventos.find((e) => e.t === 'content_block_delta' && e.j?.delta?.type === 'input_json_delta');
const md2 = r.eventos.find((e) => e.t === 'message_delta');
ok(tu?.j?.content_block?.name === 'get_weather' && /"cidade":"SP"/.test(ij?.j?.delta?.partial_json || '') && md2?.j?.delta?.stop_reason === 'tool_use', `tool_use no stream (nome ${tu?.j?.content_block?.name}, args ${ij?.j?.delta?.partial_json}, stop ${md2?.j?.delta?.stop_reason})`);
ok(ultimoCorpo.tools?.[0]?.function?.name === 'get_weather', 'as tools viram o formato do modelo (function.name)');

// 3) tradução de entrada: tool_result do cliente → mensagem role:"tool" para o modelo
await manda({ model: '451-free', max_tokens: 50, stream: true, messages: [
  { role: 'user', content: 'clima?' },
  { role: 'assistant', content: [{ type: 'tool_use', id: 'tu1', name: 'get_weather', input: { cidade: 'SP' } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '28 graus' }] },
] });
const temTool = (ultimoCorpo.messages || []).some((m) => m.role === 'tool' && /28 graus/.test(String(m.content || '')));
const temAssistCall = (ultimoCorpo.messages || []).some((m) => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls[0]?.function?.name === 'get_weather');
ok(temTool && temAssistCall, 'tool_result vira role:tool e tool_use vira tool_calls do assistente');

// 4) resposta única (não-streaming)
r = await manda({ model: '451-free', max_tokens: 100, messages: [{ role: 'user', content: 'o que é uma VPN?' }] });
ok(r.status === 200 && r.json?.type === 'message' && r.json?.role === 'assistant' && r.json?.content?.[0]?.type === 'text' && /túnel criptografado/.test(r.json.content[0].text) && r.json?.stop_reason === 'end_turn', `resposta única no formato message (${JSON.stringify(r.json?.content?.[0]).slice(0, 60)})`);
ok(typeof r.json?.usage?.output_tokens === 'number', 'usage com output_tokens');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
srv.close();
process.exit(falhas ? 1 : 0);
