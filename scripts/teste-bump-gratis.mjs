// Uso: node scripts/teste-bump-gratis.mjs <pasta src>
// Bump do grátis (dono 21/11), sem rede e sem custo: quando o computador do 451 responde "fila cheia" (posição > 0 ou
// carregando) ANTES de qualquer texto, a mensagem grátis sobe pro GLM sem censura (nuvem), SEM esperar no local, com o
// aviso "ganhou um Rapid"; sem verba de bump no dia, fica no local; "continue" nunca sobe. Gateway e GLM são falsos.
import http from 'node:http';

const dir = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vistos = { localResp: 0, glm: 0 };
let congestionado = false, carregando = false;
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const json = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const RESP_LOCAL = [`data: ${JSON.stringify({ choices: [{ delta: { content: 'resposta do local' } }] })}\n\n`, `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1500, completion_tokens: 10 } })}\n\n`, 'data: [DONE]\n\n'];
  if (req.url === '/v1/chat/completions') { // gateway local (gpt-oss)
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (congestionado || carregando) {
      res.write(`: fila ${JSON.stringify({ posicao: carregando ? 0 : 1, carregando })}\n`); // sinal de fila, antes de qualquer texto
      // Espera abortável: se o bump abortar o pedido (a resposta fecha), volta na hora e NÃO responde no local.
      let fechado = false;
      await new Promise((resolve) => { const t = setTimeout(resolve, 1500); res.on('close', () => { fechado = true; clearTimeout(t); resolve(); }); req.on('aborted', () => { fechado = true; clearTimeout(t); resolve(); }); });
      if (fechado || res.writableEnded || res.destroyed) return;
    }
    vistos.localResp++; for (const l of RESP_LOCAL) res.write(l); return res.end();
  }
  if (req.url.startsWith('/ou/')) { // OpenUncensored: classificador de busca (sem stream) e o bump (stream)
    const body = JSON.parse(raw || '{}');
    if (!body.stream) return json({ choices: [{ message: { content: 'NAO' } }], usage: { prompt_tokens: 50, completion_tokens: 1 } });
    if (!/glm-5\.3-flash-uncensored/.test(body.model || '')) return json({ error: 'modelo inesperado no bump: ' + body.model }, 400);
    vistos.glm++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'resposta rápida do GLM' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1500, completion_tokens: 200, cost: 0.0007 } })}\n\ndata: [DONE]\n\n`);
    return res.end();
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return u.startsWith(base) ? realFetch(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|OU_|OPENROUTER|CLAUDE|ANTHROPIC|FREE_|LOCAL_|SEARCH_|THROTTLE|FERRAMENTAS_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  OU_API_KEY: 'falsa', OU_BASE_URL: `${base}/ou/v1`, LOCAL_LLM_URL: base, LOCAL_LLM_TOKEN: 'falso',
  LOCAL_FREE_MODEL: 'local:gptoss20b', ACCESS_SECRET: 'segredo', THROTTLE_SECONDS: '0', FREE_BUMP_USD_DAY: '3',
});
const { app } = await import(`${dir}/app.js`);
let n = 70;
async function manda(texto, extra = {}) {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${n++}`, 'x-451-client': `aparelho-${n}`, 'user-agent': 'teste' };
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: 'local:gptoss20b', messages: [{ role: 'user', content: texto }], ...extra }) }));
  const txt = await r.text();
  const evs = txt.split('\n\n').map((b) => { const ev = /event: (\w+)/.exec(b)?.[1]; let j = null; try { j = JSON.parse(/data: (.*)/s.exec(b)?.[1]); } catch { /* */ } return { ev, j }; });
  return { avisos: evs.filter((e) => e.ev === 'warning').map((e) => e.j), done: evs.find((e) => e.ev === 'done')?.j?.content || '' };
}
let falhas = 0;
const confere = (ok, msg) => { if (!ok) falhas++; console.log(`${ok ? 'ok ' : 'FALHOU'} ${msg}`); };
const temBump = (a) => a.some((w) => w?.type === 'bump');
const avisoBump = (a) => a.find((w) => w?.type === 'bump') || {};

// 1) sem fila → responde no local, sem bump
congestionado = false; carregando = false;
let a0 = { ...vistos };
let r = await manda('o que é uma VPN?');
confere(vistos.localResp === a0.localResp + 1 && vistos.glm === a0.glm && !temBump(r.avisos) && /local/.test(r.done), `sem fila: responde no local (local+${vistos.localResp - a0.localResp}, glm+${vistos.glm - a0.glm})`);

// 2) fila cheia (posição 1) antes de qualquer texto → sobe pro GLM, sem esperar no local
congestionado = true; carregando = false;
a0 = { ...vistos };
r = await manda('o que é uma VPN?');
confere(vistos.glm === a0.glm + 1 && vistos.localResp === a0.localResp && temBump(r.avisos), `fila cheia: sobe pro GLM, o local não respondeu (glm+${vistos.glm - a0.glm}, local+${vistos.localResp - a0.localResp})`);
confere(/Rapid/.test(avisoBump(r.avisos).message || '') && avisoBump(r.avisos).offer === true && /GLM/.test(r.done), 'aviso "ganhou um Rapid" com offer:true (a tela oferece manter o passe) e a resposta veio do GLM');

// 2b) com o passe ativo (rapidPass) e SEM fila → vai direto pro GLM, nem toca no local, e marca pass (sem oferecer de novo)
congestionado = false; carregando = false;
a0 = { ...vistos };
r = await manda('o que é uma VPN?', { rapidPass: true });
confere(vistos.glm === a0.glm + 1 && vistos.localResp === a0.localResp && avisoBump(r.avisos).pass === true && !avisoBump(r.avisos).offer, `passe ativo: vai direto pro GLM sem checar fila (glm+${vistos.glm - a0.glm}, local+${vistos.localResp - a0.localResp})`);

// 3) modelo carregando → sobe pro GLM
congestionado = false; carregando = true;
a0 = { ...vistos };
r = await manda('resuma a teoria da relatividade');
confere(vistos.glm === a0.glm + 1 && temBump(r.avisos), 'modelo carregando: sobe pro GLM');

// 4) fila cheia, mas sem verba de bump no dia → espera e responde no local
congestionado = true; carregando = false;
process.env.FREE_BUMP_USD_DAY = '0';
a0 = { ...vistos };
r = await manda('o que é uma VPN?');
confere(vistos.localResp === a0.localResp + 1 && vistos.glm === a0.glm && !temBump(r.avisos), `sem verba de bump: fica no local mesmo com fila (local+${vistos.localResp - a0.localResp}, glm+${vistos.glm - a0.glm}, bump=${temBump(r.avisos)}, done=${JSON.stringify(r.done).slice(0, 40)})`);
process.env.FREE_BUMP_USD_DAY = '3';

// 5) "continue de onde parou" nunca sobe pro GLM, mesmo com fila
congestionado = true; carregando = false;
a0 = { ...vistos };
r = await manda('continue');
confere(vistos.localResp === a0.localResp + 1 && !temBump(r.avisos), 'continuação não sobe pro GLM (fica no local)');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
srv.close();
process.exit(falhas ? 1 : 0);
