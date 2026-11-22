// Uso: node scripts/teste-bump-gratis.mjs <pasta src>
// 451 Free (dono 22/11, via Super Hacking), sem rede e sem custo: o GLM 5.3 Flash sem censura vai NA FRENTE; se ele
// falhar/recusar ou acabar o teto diário, o gpt-oss local assume; com o local em fila cheia, sobe pro Rapid (GLM) com o
// passe. Confere a cascata, o teto diário e a fase 1 (ferramentas) seguindo no grátis. Gateway local e GLM são falsos.
import http from 'node:http';

const dir = process.argv[2];
let glmModo = 'ok';       // 'ok' | 'falha' | 'falha-depois-ok'
let glmChamadas = 0;      // chamadas de resposta (streaming) ao GLM
let localCongestionado = false;
const vistos = { glmResp: 0, localResp: 0 };
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  const json = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const RESP_LOCAL = [`data: ${JSON.stringify({ choices: [{ delta: { content: 'resposta do local' } }] })}\n\n`, `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1500, completion_tokens: 10 } })}\n\n`, 'data: [DONE]\n\n'];
  if (req.url === '/v1/chat/completions') { // gateway local (gpt-oss)
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (localCongestionado) {
      res.write(`: fila ${JSON.stringify({ posicao: 1, carregando: false })}\n`);
      let fechado = false;
      await new Promise((r) => { const t = setTimeout(r, 1500); res.on('close', () => { fechado = true; clearTimeout(t); r(); }); });
      if (fechado || res.writableEnded) return;
    }
    vistos.localResp++; for (const l of RESP_LOCAL) res.write(l); return res.end();
  }
  if (req.url.startsWith('/ou/')) { // GLM sem censura (OpenUncensored, OpenAI-compatível): só respostas em streaming
    if (!body.stream) return json({ choices: [{ message: { content: 'NAO' } }], usage: {} }); // classificador (não deve rodar com soFerramentas)
    glmChamadas++;
    const falha = glmModo === 'falha' || (glmModo === 'falha-depois-ok' && glmChamadas === 1);
    if (falha) return json({ error: 'glm fora' }, 500); // GLM caiu → o grátis cai no local
    vistos.glmResp++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'resposta do GLM' } }] })}\n\n`);
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
Object.assign(process.env, { OU_API_KEY: 'falsa', OU_BASE_URL: `${base}/ou/v1`, LOCAL_LLM_URL: base, LOCAL_LLM_TOKEN: 'falso', LOCAL_FREE_MODEL: 'local:gptoss20b', ACCESS_SECRET: 'segredo', THROTTLE_SECONDS: '0', FREE_BUMP_USD_DAY: '3' });
const { app } = await import(`${dir}/app.js`);
let n = 70;
async function manda(texto, extra = {}) {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${n++}`, 'x-451-client': `ap-${n}`, 'user-agent': 'teste' };
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: 'local:gptoss20b', messages: [{ role: 'user', content: texto }], ...extra }) }));
  const txt = await r.text();
  const evs = txt.split('\n\n').map((b) => { const ev = /event: (\w+)/.exec(b)?.[1]; let j = null; try { j = JSON.parse(/data: (.*)/s.exec(b)?.[1]); } catch { /* */ } return { ev, j }; });
  return { avisos: evs.filter((e) => e.ev === 'warning').map((e) => e.j), done: evs.find((e) => e.ev === 'done')?.j?.content || '' };
}
let falhas = 0;
const ok = (c, m) => { if (!c) falhas++; console.log(`${c ? 'ok ' : 'FALHOU'} ${m}`); };
const avisoBump = (a) => a.find((w) => w?.type === 'bump') || {};

// 1) GLM na frente responde o Free (verba ok, sem fila)
glmModo = 'ok'; localCongestionado = false; glmChamadas = 0;
let a0 = { ...vistos };
let r = await manda('o que é uma VPN?');
ok(vistos.glmResp === a0.glmResp + 1 && vistos.localResp === a0.localResp && /GLM/.test(r.done) && avisoBump(r.avisos).front === true, `Free via GLM na frente (glm+${vistos.glmResp - a0.glmResp}, local+${vistos.localResp - a0.localResp}, front=${avisoBump(r.avisos).front})`);

// 2) GLM falha → cai no local
glmModo = 'falha'; localCongestionado = false; glmChamadas = 0;
a0 = { ...vistos };
r = await manda('o que é uma VPN?');
ok(vistos.localResp === a0.localResp + 1 && /local/.test(r.done), `GLM falhou → caiu no local (local+${vistos.localResp - a0.localResp}, done=${JSON.stringify(r.done).slice(0, 30)})`);

// 3) teto diário estourado → vai direto no local, sem chamar o GLM
glmModo = 'ok'; localCongestionado = false; process.env.FREE_BUMP_USD_DAY = '0'; glmChamadas = 0;
a0 = { ...vistos };
r = await manda('o que é uma VPN?');
ok(vistos.localResp === a0.localResp + 1 && glmChamadas === 0 && /local/.test(r.done), `teto estourado → local direto, sem GLM (glmChamadas=${glmChamadas})`);
process.env.FREE_BUMP_USD_DAY = '3';

// 4) GLM da frente com um tropeço + local em fila cheia: o grátis AINDA recebe a resposta pelo GLM (a própria frente
//    se recupera; se chegasse ao local cheio, o streamLocal joga bump e a catch sobe pro Rapid, também GLM). Sem travar.
glmModo = 'falha-depois-ok'; localCongestionado = true; glmChamadas = 0;
a0 = { ...vistos };
r = await manda('o que é uma VPN?');
ok(vistos.glmResp === a0.glmResp + 1 && /GLM/.test(r.done), `GLM tropeça + local cheio → o grátis ainda responde pelo GLM (glm+${vistos.glmResp - a0.glmResp}, local+${vistos.localResp - a0.localResp})`);

// 5) passe Rapid ativo → direto GLM, sem fila
glmModo = 'ok'; localCongestionado = false; glmChamadas = 0;
a0 = { ...vistos };
r = await manda('o que é uma VPN?', { rapidPass: true });
ok(vistos.glmResp === a0.glmResp + 1 && avisoBump(r.avisos).pass === true, `passe ativo → GLM direto com a contagem (pass=${avisoBump(r.avisos).pass})`);

// 6) "continue" nunca começa pelo GLM: segue no local
glmModo = 'ok'; localCongestionado = false; glmChamadas = 0;
a0 = { ...vistos };
r = await manda('continue');
ok(vistos.localResp === a0.localResp + 1 && glmChamadas === 0, `continuação fica no local, sem GLM (glmChamadas=${glmChamadas})`);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
srv.close();
process.exit(falhas ? 1 : 0);
