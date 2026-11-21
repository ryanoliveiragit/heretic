// Uso: node scripts/teste-prazo-local.mjs <pasta src>
// Guarda de tempo dos modelos locais, sem rede e sem custo: um "porteiro" falso lento. Prazo curto (6 s).
// 1) fila 2 s + texto lento por 10 s → fecha no prazo com o texto parcial e o aviso de "continue".
// 2) só fila por 10 s → erro claro de "ocupado" (sem texto parcial).
// 3) resposta rápida → inteira, sem aviso.
import http from 'node:http';
const dir = process.argv[2];
let cenario = 'lento';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = http.createServer(async (req, res) => {
  for await (const _ of req) { /* corpo */ }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'x-fila': '1' });
  let vivo = true; res.on('close', () => { vivo = false; });
  const filaSeg = cenario === 'so-fila' ? 10 : cenario === 'lento' ? 2 : 0;
  for (let i = 0; i < filaSeg && vivo; i++) { res.write(`: fila ${JSON.stringify({ posicao: 1, carregando: false, modelo: 'gptoss20b' })}\n\n`); await sleep(1000); }
  const n = cenario === 'rapido' ? 5 : 40;
  for (let i = 0; i < n && vivo; i++) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `parte${i} ` } }] })}\n\n`); await sleep(cenario === 'rapido' ? 10 : 250); }
  if (vivo) { res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: n } })}\n\ndata: [DONE]\n\n`); res.end(); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_)/.test(k)) delete process.env[k];
Object.assign(process.env, { LOCAL_LLM_URL: `http://127.0.0.1:${srv.address().port}`, LOCAL_LLM_TOKEN: 'falso', LOCAL_PRAZO_MS: '6000' });
const { streamChat } = await import(`${dir}/upstream.js`);
for (const c of ['lento', 'so-fila', 'rapido']) {
  cenario = c;
  let texto = '', erro = null; const avisos = []; const t0 = Date.now();
  try {
    for await (const _ of streamChat('chat', { modelId: 'local:gptoss20b', messages: [{ role: 'user', content: 'oi' }], systemPrompt: 'teste', inicio: Date.now() }, {
      onToken: (t) => { texto += t; }, onWarning: (w) => avisos.push(w.message), usage: {},
    })) { /* */ }
  } catch (e) { erro = e.message; }
  console.log(`- ${c}: ${((Date.now() - t0) / 1000).toFixed(1)} s | partes recebidas ${(texto.match(/parte\d+/g) || []).length} | aviso de corte: ${texto.includes('tempo máximo') ? 'sim' : 'não'} | erro: ${erro || '—'} | avisos de fila: ${avisos.filter(Boolean).length}`);
}
srv.close();
process.exit(0);
