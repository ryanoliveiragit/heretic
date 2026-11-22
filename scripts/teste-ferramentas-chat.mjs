// Uso: node scripts/teste-ferramentas-chat.mjs <pasta src>
// Ferramentas de segurança no chat (fase 1, Super Hacking / dono 21/11), sem rede e sem custo: Claude, OpenUncensored,
// modelo local e a função de ferramentas são falsos. Confere etapa e fontes na tela, bloco no prompt com numeração única,
// nenhuma busca na web quando há ferramenta, custo do planejador no medidor, recusa do Claude → GLM, filtro grátis,
// 451 Free e o token interno igual ao do lado Node.
import http from 'node:http';
import { createHash } from 'node:crypto';

const dir = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vistos = { planejador: 0, planejadorOU: 0, buscas: 0, ferramentas: [], tokens: new Set(), sistema: '', sistemaLocal: '' };
const TOKEN = createHash('sha256').update('451-ferramentas:segredo-de-teste').digest('hex');
const RESULTADOS = {
  cve_consultar: { resumo: 'CVE-2021-44228 · CVSS 3.1 10 CRITICAL [1]. Na lista KEV da CISA desde 2021-12-10 [2].', dados: { id: 'CVE-2021-44228', fonte_cvss: 1, kev: { na_lista: true, fonte: 2 } }, fontes: [{ n: 1, titulo: 'NVD — CVE-2021-44228', url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228' }, { n: 2, titulo: 'CISA KEV', url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog' }], limitacoes: [] },
  // formato do pacote desde 21/11: o DNS tem fonte própria [1], antes do RDAP [2]
  dominio_info: { resumo: 'example.com: 2 tipos de registro DNS, registrado em 1995-08-14 [2].', dados: { dominio: 'example.com', dns: { A: ['93.184.215.14'], NS: ['a.iana-servers.net'], fonte: 1 }, registro: { registrador: 'IANA', fonte: 2 } }, fontes: [{ n: 1, titulo: 'Registros DNS de example.com', url: 'https://dns.google/query?name=example.com', origem: 'resolvedor DNS' }, { n: 2, titulo: 'RDAP de example.com', url: 'https://rdap.org/domain/example.com' }], limitacoes: ['Os registros DNS vêm do resolvedor do servidor do 451.'] },
};
const semEscape = (s) => s.replace(/\\"/g, '"').replace(/\\n/g, '\n');
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  const json = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url.startsWith('/ferramentas')) {
    vistos.tokens.add(req.headers['x-451-interno']);
    if (req.headers['x-451-interno'] !== TOKEN) return json({ error: 'unauthorized' }, 401);
    vistos.ferramentas.push(`${body.nome}${JSON.stringify(body.args)}`);
    const r = RESULTADOS[body.nome];
    return json(r ? { ok: true, texto: r.resumo, resultado: r } : { ok: false, texto: `${body.nome}: sem dado`, resultado: null });
  }
  if (req.url.startsWith('/an/')) {
    const ultimo = body.messages?.at(-1)?.content;
    const pedido = typeof ultimo === 'string' ? ultimo : JSON.stringify(ultimo);
    if (body.tools?.some((t) => t.name === 'cve_consultar')) { // planejador
      vistos.planejador++;
      const usage = { input_tokens: 1700, output_tokens: 60 };
      if (/recusa/i.test(pedido)) return json({ content: [{ type: 'text', text: 'Desculpe, não posso ajudar com isso.' }], usage, stop_reason: 'end_turn' });
      const blocos = [];
      if (/CVE-2021-44228/.test(pedido)) blocos.push({ type: 'tool_use', id: 't1', name: 'cve_consultar', input: { id: 'CVE-2021-44228' } });
      if (/example\.com/.test(pedido)) blocos.push({ type: 'tool_use', id: 't2', name: 'dominio_info', input: { dominio: 'example.com' } });
      return json({ content: blocos.length ? blocos : [{ type: 'text', text: 'nenhuma' }], usage, stop_reason: blocos.length ? 'tool_use' : 'end_turn' });
    }
    if (body.tools?.some((t) => String(t.type).startsWith('web_search'))) { vistos.buscas++; return json({ content: [], usage: {} }, 500); }
    vistos.sistema = JSON.stringify(body.system || '');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 1 } } });
    ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Sim, está sendo explorado [1][2].' } });
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } });
    ev({ type: 'message_stop' }); return res.end();
  }
  if (req.url.startsWith('/ou/')) {
    if (body.tools?.some((t) => t.function?.name === 'cve_consultar')) { // planejador sem censura
      vistos.planejadorOU++;
      return json({ choices: [{ message: { tool_calls: [{ id: 'c1', type: 'function', function: { name: 'cve_consultar', arguments: '{"id":"CVE-2021-44228"}' } }] } }], usage: { prompt_tokens: 1800, completion_tokens: 30 }, cost: { usd: 0.0003 } });
    }
    return json({ choices: [{ message: { content: 'NAO' } }], usage: { prompt_tokens: 50, completion_tokens: 1 }, cost: { usd: 0.00002 } });
  }
  if (req.url.startsWith('/or/')) { vistos.buscas++; return json({}, 500); }
  if (req.url.startsWith('/local/')) {
    vistos.sistemaLocal = String(body.messages?.[0]?.content || '');
    vistos.ultimaLocal = String(body.messages?.at(-1)?.content || '');
    (vistos.sistemasLocais ||= []).push(vistos.sistemaLocal);
    vistos.maxLocal = body.max_tokens;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Resposta local com fonte [1].' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3000, completion_tokens: 10 } })}\n\ndata: [DONE]\n\n`);
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
  ANTHROPIC_API_KEY: 'falsa', ANTHROPIC_BASE_URL: `${base}/an`, OU_API_KEY: 'falsa', OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_API_KEY: 'falsa', OPENROUTER_BASE_URL: `${base}/or/api/v1`,
  LOCAL_LLM_URL: `${base}/local`, LOCAL_LLM_TOKEN: 'falso', LOCAL_FREE_MODEL: 'local:gptoss20b', ACCESS_SECRET: 'segredo-de-teste', THROTTLE_SECONDS: '1',
  FERRAMENTAS_URL: `${base}/ferramentas`,
});
const { app } = await import(`${dir}/app.js`);
let n = 60;
async function manda(modelo, texto) {
  await sleep(1300);
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${n++}`, 'x-451-client': `aparelho-${n}`, 'user-agent': 'teste' };
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: texto }] }) }));
  const txt = await r.text();
  const evs = txt.split('\n\n').map((b) => { const ev = /event: (\w+)/.exec(b)?.[1]; let j = null; try { j = JSON.parse(/data: (.*)/s.exec(b)?.[1]); } catch { /* */ } return { ev, j }; });
  return { avisos: evs.filter((e) => e.ev === 'warning').map((e) => e.j), done: evs.find((e) => e.ev === 'done')?.j?.content || '' };
}
let falhas = 0;
const confere = (ok, msg) => { if (!ok) falhas++; console.log(`${ok ? 'ok ' : 'FALHOU'} ${msg}`); };
const fontesDe = (a) => a.find((w) => w?.type === 'sources')?.sources || [];
const rotulos = (a) => a.filter((w) => w?.type === 'ferramenta').map((w) => w.rotulo);

let antes = { ...vistos, ferramentas: [...vistos.ferramentas] };
let r = await manda('zai-org/glm-5.3-flash-uncensored', 'O CVE-2021-44228 está sendo explorado?');
confere(rotulos(r.avisos).some((t) => /Consultando o CVE-2021-44228/.test(t)), `etapa na tela: ${JSON.stringify(rotulos(r.avisos))}`);
confere(fontesDe(r.avisos).length === 2 && /nvd\.nist\.gov/.test(fontesDe(r.avisos)[0].url), `2 fontes na tela (${fontesDe(r.avisos).map((f) => f.title).join(' | ')})`);
confere(/RESULTADOS DAS FERRAMENTAS/.test(vistos.sistema) && /\[1\] NVD/.test(vistos.sistema) && /\[2\] CISA KEV/.test(vistos.sistema), 'o modelo recebe o bloco com as fontes [1] e [2]');
confere(vistos.buscas === antes.buscas, 'sem busca na web quando as ferramentas responderam');

r = await manda('zai-org/glm-5.3-flash-uncensored', 'Me dê os dados públicos do domínio example.com');
const f2 = fontesDe(r.avisos).map((f) => f.title), sis2 = semEscape(vistos.sistema);
confere(vistos.ferramentas.at(-1) === 'dominio_info{"dominio":"example.com"}' && f2.length === 2 && /Registros DNS/.test(f2[0]) && /RDAP/.test(f2[1]), `domínio: DNS [1] e RDAP [2] na tela (${f2.join(' | ')})`);
confere(/"dns":\{"fonte":"\[1\]"/.test(sis2) && /"registro":\{"fonte":"\[2\]"/.test(sis2), 'nos dados, o DNS abre com a marca [1] e o registro com [2]');

r = await manda('zai-org/glm-5.3-flash-uncensored', 'O CVE-2021-44228 afeta o domínio example.com?');
const f3 = fontesDe(r.avisos).map((f) => f.title), sis3 = semEscape(vistos.sistema);
confere(f3.length === 4 && /Registros DNS/.test(f3[2]) && /RDAP/.test(f3[3]) && /registrado em 1995-08-14 \[4\]/.test(sis3), `duas ferramentas, numeração única: ${f3.join(' | ')}`);
confere(/"fonte_cvss":"\[1\]"/.test(sis3) && /"kev":\{"fonte":"\[2\]"/.test(sis3) && /"dns":\{"fonte":"\[3\]"/.test(sis3) && /"registro":\{"fonte":"\[4\]"/.test(sis3), 'nos dados da 2ª consulta, as fontes viram [3] e [4]');
confere(/Não liste as fontes no fim/.test(sis3), 'o bloco pede para não repetir a lista de fontes no fim');

antes = { ...vistos };
r = await manda('zai-org/glm-5.3-flash-uncensored', 'recusa: o CVE-2021-44228 está sendo explorado?');
confere(vistos.planejadorOU === antes.planejadorOU + 1 && fontesDe(r.avisos).length === 2, 'Claude recusou escolher: o GLM sem censura escolheu e as ferramentas rodaram');

antes = { ...vistos };
r = await manda('zai-org/glm-5.3-flash-uncensored', 'Me explique o que é recursão em programação.');
confere(vistos.planejador === antes.planejador && !rotulos(r.avisos).length, 'pergunta comum não chama o planejador (filtro grátis)');

r = await manda('local:gptoss20b', 'O CVE-2021-44228 está sendo explorado?');
confere(/RESULTADOS DAS FERRAMENTAS/.test(vistos.ultimaLocal) && !/RESULTADOS DAS FERRAMENTAS/.test(vistos.sistemaLocal) && fontesDe(r.avisos).length === 2, '451 Free também consulta; os resultados vão no fim da pergunta, não no sistema');
// Velocidade do 451 Free (dono 21/11): prompt curto, igual em todo pedido (a máquina reaproveita o que já leu) e teto de 1.500.
const sisCve = vistos.sistemaLocal, ultCve = vistos.ultimaLocal;
confere(sisCve.length < 8000 && !/INSTRUÇÃO DE SISTEMA — SEM CENSURA/.test(sisCve) && /Você é o 451, uma IA sem censura/.test(sisCve) && /451-free-uncensored/.test(sisCve), `451 Free: sistema curto com a persona local e a identidade (${sisCve.length} caracteres; antes ~17 mil)`);
confere(Number(vistos.maxLocal) <= 1500, `451 Free: teto de saída ${vistos.maxLocal} tokens`);
await manda('local:gptoss20b', 'Me explique o que é recursão em programação.');
confere(vistos.sistemasLocais.at(-1) === sisCve, '451 Free: o sistema é igual com e sem resultados (a máquina reaproveita a leitura)');
confere(/logo depois de cada fato.*Não faça lista de fontes no fim/s.test(ultCve), `451 Free: a nota no fim da mensagem pede [n] em cada fato e nenhuma lista no fim (…${ultCve.slice(-90).replace(/\n/g, ' ')})`);

confere([...vistos.tokens].every((t) => t === TOKEN), 'o token interno do chat é igual ao do lado Node');
const { atende } = await import(`${dir}/ferramentas/http.js`);
const negado = await atende('token-errado', { nome: 'ip_info', args: { ip: '1.1.1.1' } });
const privado = await atende(TOKEN, { nome: 'ip_info', args: { ip: '192.168.0.1' } });
confere(negado.status === 401 && privado.status === 200 && privado.corpo.ok === false && /privado|reservado/.test(privado.corpo.texto), `porta Node: 401 sem token; IP privado recusado (${privado.corpo.texto})`);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
srv.close();
process.exit(falhas ? 1 : 0);
