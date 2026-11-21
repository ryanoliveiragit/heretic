// Uso: node scripts/teste-busca-gratis.mjs <pasta src>
// Busca na web do grátis no gpt-oss local (dono 21/11), sem rede e sem custo: classificador, busca e modelo
// local falsos; memória no lugar do Redis. Confere: busca com fontes; teto por aparelho; teto do dia; pergunta
// comum sem busca; marca [PRO] virando o aviso só 1 vez por conversa; imagem no grátis → aviso do Pro.
import http from 'node:http';

const dir = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ultimoSistema = '';
const fotosRecebidas = [];
const conta = { claude: 0, or: 0, fotoClaude: 0, fotoInkling: 0 };
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  if (req.url.startsWith('/an/')) { // Claude Haiku (21/11): busca na web e fotos do grátis
    const ultimo = body.messages?.at(-1)?.content;
    const pedido = typeof ultimo === 'string' ? ultimo : (ultimo || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    if (body.tools?.some((t) => String(t.type).startsWith('web_search'))) {
      conta.claude++;
      res.writeHead(200, { 'content-type': 'application/json' });
      if (/recusa/i.test(pedido)) return res.end(JSON.stringify({ content: [{ type: 'text', text: 'Não posso ajudar com essa busca.' }], usage: { input_tokens: 300, output_tokens: 10 }, stop_reason: 'end_turn' }));
      return res.end(JSON.stringify({
        content: [
          { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: pedido } },
          { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://cotacao.exemplo.com.br/hoje', title: 'Cotação hoje', encrypted_content: 'x' }] },
          { type: 'text', text: '- A cotação fechou em alta.', citations: [{ type: 'web_search_result_location', url: 'https://cotacao.exemplo.com.br/hoje', title: 'Cotação hoje', cited_text: 'A cotação fechou em alta.' }] },
        ],
        usage: { input_tokens: 14000, output_tokens: 400, server_tool_use: { web_search_requests: 1 } }, stop_reason: 'end_turn',
      }));
    }
    // foto: Claude vê a imagem em streaming; "proibida" no pedido = o Claude recusa (e o Inkling assume)
    conta.fotoClaude++;
    fotosRecebidas.push((ultimo || []).filter((b) => b.type === 'image').length);
    const texto = /proibid/i.test(pedido) ? 'Não posso ajudar com essa imagem.' : 'Li a foto pelo Claude: total de R$ 42,90.';
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    ev({ type: 'message_start', message: { usage: { input_tokens: 3000, output_tokens: 1 } } });
    ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    for (const p of texto.match(/.{1,7}/gs)) ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } });
    ev({ type: 'content_block_stop', index: 0 });
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 30 } });
    ev({ type: 'message_stop' });
    return res.end();
  }
  if (req.url.startsWith('/ou/') && body.model === 'inkling-2-mini-uncensored') { // foto: Inkling lê a imagem
    conta.fotoInkling++;
    fotosRecebidas.push((body.messages?.at(-1)?.content || []).filter((p) => p.type === 'image_url').length);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Li a foto: é uma nota com total de R$ 42,90.' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 6000, completion_tokens: 30 }, cost: { usd: 0.0011 } })}\n\ndata: [DONE]\n\n`);
    return res.end();
  }
  if (req.url.startsWith('/ou/')) { // classificador: busca se a pergunta tem "hoje" ou "cotação"
    const q = String(body.messages?.[1]?.content || '');
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { content: /hoje|cota/i.test(q) ? 'SIM' : 'NAO' } }], usage: { prompt_tokens: 200, completion_tokens: 1 }, cost: { usd: 0.000026 } }));
  }
  if (req.url.startsWith('/or/')) { // busca web (OpenRouter + Exa): agora só estepe
    conta.or++;
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { content: '- O dólar comercial fechou a R$ 5,88.', annotations: [{ type: 'url_citation', url_citation: { url: 'https://cotacao.exemplo.com.br/dolar', title: 'Dólar hoje', content: 'O dólar comercial fechou em alta.' } }] } }], usage: { prompt_tokens: 1300, completion_tokens: 300, cost: 0.0081 } }));
  }
  if (req.url.startsWith('/local/')) { // gpt-oss local
    ultimoSistema = String(body.messages?.[0]?.content || '');
    const usuario = String(body.messages?.filter((m) => m.role === 'user').pop()?.content || '');
    const texto = /gigante/i.test(usuario) ? '[PRO]\nComeço pelo esqueleto do sistema e pela primeira parte.'
      : /complexo/i.test(usuario) ? 'Aqui vai a primeira parte do projeto, com a estrutura principal.\n\n[PRO]'
      : `Resposta ${ultimoSistema.includes('## RESULTADOS DE BUSCA NA WEB (reais, agora)') ? 'com' : 'sem'} busca.`;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const p of texto.match(/.{1,7}/gs)) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 4300, completion_tokens: 40 } })}\n\ndata: [DONE]\n\n`);
    return res.end();
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return u.startsWith(base) ? realFetch(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|OU_|OPENROUTER|CLAUDE|ANTHROPIC|FREE_|LOCAL_|SEARCH_|ROUTER_|THROTTLE)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  OU_API_KEY: 'falsa', OU_BASE_URL: `${base}/ou/v1`, OPENROUTER_API_KEY: 'falsa', OPENROUTER_BASE_URL: `${base}/or/api/v1`,
  ANTHROPIC_API_KEY: 'falsa', ANTHROPIC_BASE_URL: `${base}/an`,
  LOCAL_LLM_URL: `${base}/local`, LOCAL_LLM_TOKEN: 'falso', LOCAL_FREE_MODEL: 'local:gptoss20b', ACCESS_SECRET: 'segredo-de-teste',
  FREE_SEARCH_PER_DEVICE: '2', THROTTLE_SECONDS: '1',
});
const { app } = await import(`${dir}/app.js`);

async function manda(nome, aparelho, mensagens, extra = {}) {
  await sleep(1200);
  const antes = { ...conta };
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${aparelho}`, 'x-451-client': `aparelho-${aparelho}`, 'user-agent': 'teste' };
  const r = await app.fetch(new Request('http://local/api/chat', { method: 'POST', headers, body: JSON.stringify({ model: 'local:gptoss20b', messages: mensagens, ...extra }) }));
  const txt = await r.text();
  let corpo = {}; try { corpo = JSON.parse(txt); } catch { /* stream */ }
  const eventos = txt.split('\n\n').map((b) => { const ev = /event: (\w+)/.exec(b)?.[1]; const d = /data: (.*)/s.exec(b)?.[1]; let j = null; try { j = JSON.parse(d); } catch { /* */ } return { ev, j }; });
  const done = eventos.find((e) => e.ev === 'done')?.j?.content || '';
  const tokens = eventos.filter((e) => e.ev === 'token').map((e) => e.j?.token || '').join('');
  const buscou = eventos.some((e) => e.ev === 'warning' && e.j?.type === 'search');
  const fontes = eventos.find((e) => e.ev === 'warning' && e.j?.type === 'sources')?.j?.sources?.length || 0;
  const pro = eventos.find((e) => e.ev === 'warning' && e.j?.type === 'pro_aviso')?.j || null;
  const apagou = eventos.some((e) => e.ev === 'warning' && e.j?.type === 'refusal_forced');
  const quem = [['busca Claude', 'claude'], ['estepe OpenRouter', 'or'], ['foto Claude', 'fotoClaude'], ['foto Inkling', 'fotoInkling']]
    .map(([n, k]) => (conta[k] - antes[k] ? `${n} ${conta[k] - antes[k]}` : '')).filter(Boolean).join(', ') || 'sem apoio pago';
  console.log(`- ${nome}: HTTP ${r.status}${corpo.message ? ` "${corpo.message}"` : ''} | buscou ${buscou ? 'sim' : 'não'}${fontes ? ` (${fontes} fonte)` : ''} | marca [PRO] na tela: ${tokens.includes('[PRO]') ? 'SIM' : 'não'} | aviso: ${/acabou por hoje/.test(done) ? 'busca esgotada' : /só funciona direito no 451 Pro/.test(done) ? 'Pro' : 'nenhum'}${pro ? ` (${pro.motivo})` : ''} | ${quem}${apagou ? ' | a tela apagou o começo do Claude' : ''} | resposta: ${JSON.stringify(done.replace(/\n/g, ' ').slice(0, 90))}`);
  return done;
}
const um = (t) => [{ role: 'user', content: t }];
await manda('1) aparelho A, dólar hoje', 1, um('Quanto está o dólar hoje?'));
await manda('2) aparelho A, euro hoje (2ª busca)', 1, um('Qual a cotação do euro hoje?'));
await manda('3) aparelho A, libra hoje (passou de 2 por aparelho)', 1, um('Qual a cotação da libra hoje?'));
await manda('3b) aparelho H, dólar hoje com recusa do Claude na busca', 8, um('Quanto está o dólar hoje? recusa'));
await manda('4) aparelho B, conversa comum', 2, um('Oi, tudo bem com você hoje cedo?'.replace('hoje cedo', 'agora')));
const r5 = await manda('5) aparelho B, tarefa complexa', 2, um('Faça um projeto complexo de loja virtual completo.'));
await manda('6) aparelho B, outra complexa na mesma conversa', 2, [...um('Faça um projeto complexo de loja virtual completo.'), { role: 'assistant', content: r5 }, { role: 'user', content: 'Agora outro projeto complexo de ERP.' }]);
await manda('5b) aparelho E, tarefa gigante (marca no começo)', 5, um('Faça um sistema gigante de banco completo.'));
await manda('7) aparelho C, imagem no grátis', 3, [{ role: 'user', content: 'O que tem na imagem?', attachments: [{ mime: 'image/png', name: 'a.png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }] }]);
process.env.FREE_SEARCH_DAY_USD = '0.01'; // já foram US$ 0,0162 de busca hoje: o teto do dia passa
await manda('8) aparelho D, dólar hoje (teto do dia esgotado)', 4, um('Quanto está o dólar hoje?'));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');
const foto = (t, i) => ({ role: 'user', content: t, attachments: [{ mime: 'image/png', name: `f${i}.png`, data: PNG }] });
const r9 = await manda('9) aparelho F, foto no grátis', 6, [foto('Quanto deu a nota?', 1)]);
console.log(`   fotos que chegaram ao modelo: ${fotosRecebidas.at(-1)}`);
await manda('10) aparelho F, PDF no grátis', 6, [{ role: 'user', content: 'Resuma o PDF.', attachments: [{ mime: 'application/pdf', name: 'a.pdf', data: PDF }] }]);
const antes = fotosRecebidas.length;
await manda('11) aparelho F, texto depois da foto', 6, [foto('Quanto deu a nota?', 1), { role: 'assistant', content: r9 }, { role: 'user', content: 'E se eu dividir por dois?' }]);
console.log(`   a foto antiga foi reenviada ao Inkling: ${fotosRecebidas.length > antes ? 'SIM' : 'não'}`);
await manda('12) aparelho F, 2ª foto', 6, [foto('E esta?', 2)]);
await manda('13) aparelho F, 3ª foto', 6, [foto('E esta outra?', 3)]);
await manda('13b) aparelho I, foto que o Claude recusa', 9, [foto('Essa foto proibida, o que tem?', 6)]);
await manda('14) aparelho F, 4ª foto (passou de 3 por dia)', 6, [foto('Mais uma?', 4)]);
process.env.FREE_PHOTO_DAY_USD = '0.001'; // já foram ~US$ 0,0033 de fotos hoje
await manda('15) aparelho G, foto com a verba do dia esgotada', 7, [foto('E agora?', 5)]);
srv.close();
process.exit(0);
