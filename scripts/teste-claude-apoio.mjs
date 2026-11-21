// Uso: node scripts/teste-claude-apoio.mjs <pasta src>
// Claude no apoio (dono 21/11: "usar o Claude pro máximo de coisas que der"; o sem censura só na recusa), sem rede e
// sem custo: Anthropic, OpenUncensored e OpenRouter falsos. Confere: (1) busca pelo Claude Haiku com fontes e custo
// no medidor; recusa, erro ou nenhuma busca → estepe do OpenRouter; SEARCH_CLAUDE=0 → só OpenRouter. (2) leitor de
// anexos: Claude → Inkling na recusa (só imagem) → OpenRouter por último; cada leitura entra no medidor.
import http from 'node:http';

const dir = process.argv[2];
const chamadas = [];
let claudeFora = false;
const srv = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw || '{}');
  const json = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url.startsWith('/an/')) {
    if (claudeFora) { chamadas.push('claude:fora'); return json({ type: 'error', error: { type: 'overloaded_error', message: 'falso' } }, 529); }
    const ultimo = body.messages?.at(-1)?.content;
    const textoPedido = typeof ultimo === 'string' ? ultimo : (ultimo || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    if (body.tools?.some((t) => String(t.type).startsWith('web_search'))) {
      chamadas.push('claude:busca');
      if (/recusa/i.test(textoPedido)) return json({ content: [{ type: 'text', text: 'Não posso ajudar com essa busca.' }], usage: { input_tokens: 300, output_tokens: 10 }, stop_reason: 'end_turn' });
      if (/semBusca/i.test(textoPedido)) return json({ content: [{ type: 'text', text: '- Sei de cabeça: R$ 5,00.' }], usage: { input_tokens: 300, output_tokens: 10 }, stop_reason: 'end_turn' });
      if (/duasBuscas/i.test(textoPedido)) return json({ // 21/11 (real): a 2ª tentativa leva erro de limite e vem por último
        content: [
          { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'jogo' } },
          { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://placar.exemplo.com.br/jogo', title: 'Placar', encrypted_content: 'x' }] },
          { type: 'text', text: 'Vou refinar a busca.' },
          { type: 'server_tool_use', id: 's2', name: 'web_search', input: { query: 'jogo placar' } },
          { type: 'web_search_tool_result', tool_use_id: 's2', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
          { type: 'text', text: '- O jogo terminou 2 a 1.', citations: [{ type: 'web_search_result_location', url: 'https://placar.exemplo.com.br/jogo', title: 'Placar', cited_text: 'Terminou 2 a 1.' }] },
        ],
        usage: { input_tokens: 13000, output_tokens: 900, server_tool_use: { web_search_requests: 1 } }, stop_reason: 'end_turn',
      });
      return json({
        content: [
          { type: 'text', text: 'Vou buscar.' },
          { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: textoPedido } },
          { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [
            { type: 'web_search_result', url: 'https://outro.exemplo.com.br/a', title: 'Outra página', encrypted_content: 'x', page_age: '1 dia' },
            { type: 'web_search_result', url: 'https://cotacao.exemplo.com.br/dolar', title: 'Dólar hoje', encrypted_content: 'y', page_age: 'hoje' },
          ] },
          { type: 'text', text: '- O dólar comercial fechou a R$ 5,93.', citations: [{ type: 'web_search_result_location', url: 'https://cotacao.exemplo.com.br/dolar', title: 'Dólar hoje', cited_text: 'O dólar comercial fechou a R$ 5,93 nesta sexta.', encrypted_index: 'z' }] },
        ],
        usage: { input_tokens: 14000, output_tokens: 400, server_tool_use: { web_search_requests: 1 } }, stop_reason: 'end_turn',
      });
    }
    // leitor de anexos (sem stream): recusa se a imagem for a "proibida"
    const bloco = (ultimo || []).find((b) => b.type === 'image' || b.type === 'document');
    chamadas.push(`claude:leitura:${bloco?.type}`);
    if (bloco?.source?.data?.startsWith('UFJPSUJJ')) return json({ content: [{ type: 'text', text: 'Desculpe, não posso descrever esta imagem.' }], usage: { input_tokens: 1600, output_tokens: 12 }, stop_reason: 'end_turn' });
    return json({ content: [{ type: 'text', text: `Transcrição pelo Claude (${bloco?.type}).` }], usage: { input_tokens: 1600, output_tokens: 80 }, stop_reason: 'end_turn' });
  }
  if (req.url.startsWith('/ou/')) {
    chamadas.push(`ou:${body.model}`);
    return json({ choices: [{ message: { content: 'Transcrição pelo Inkling.' } }], usage: { prompt_tokens: 3100, completion_tokens: 60 }, cost: { usd: 0.0005 } });
  }
  if (req.url.startsWith('/or/')) {
    chamadas.push(`or:${body.model}`);
    if (body.plugins?.some((p) => p.id === 'web')) {
      return json({ choices: [{ message: { content: '- Pelo estepe: o dólar fechou a R$ 5,93.', annotations: [{ type: 'url_citation', url_citation: { url: 'https://estepe.exemplo.com.br/dolar', title: 'Dólar (estepe)', content: 'O dólar fechou a R$ 5,93.' } }] } }], usage: { prompt_tokens: 1300, completion_tokens: 300, cost: 0.0081 } });
    }
    return json({ choices: [{ message: { content: `Transcrição pelo OpenRouter (${body.model}).` } }], usage: { prompt_tokens: 2000, completion_tokens: 80, cost: 0.0002 } });
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opt) => { const u = String(url?.url || url); return u.startsWith(base) ? realFetch(url, opt) : Promise.reject(new Error('rede bloqueada no teste')); };
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|ADMIN|ACCESS|PRO_CODES|OU_|OPENROUTER|CLAUDE|ANTHROPIC|FREE_|LOCAL_|SEARCH_|ROUTER_|READER_|FOTO_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  ANTHROPIC_API_KEY: 'falsa', ANTHROPIC_BASE_URL: `${base}/an`, OU_API_KEY: 'falsa', OU_BASE_URL: `${base}/ou/v1`,
  OPENROUTER_API_KEY: 'falsa', OPENROUTER_BASE_URL: `${base}/or/api/v1`,
});
const { webContext } = await import(`${dir}/upstream.js`);
const { digestAttachments } = await import(`${dir}/attachments.js`);

const partes = (u) => (u.partes || []).map((p) => `${p.p}:${p.m} US$ ${Number(p.usd).toFixed(5)}`).join(' + ') || '(nada no medidor)';
let falhas = 0;
const confere = (ok, msg) => { if (!ok) falhas++; console.log(`${ok ? 'ok ' : 'FALHOU'} ${msg}`); };

console.log('— busca —');
async function busca(nome, q, esperado) {
  chamadas.length = 0;
  const usage = {};
  const wc = await webContext(q, null, { usage });
  const via = chamadas.join(' → ');
  confere(via === esperado, `${nome}: ${via} | fontes ${wc?.sources?.map((s) => new URL(s.url).hostname).join(', ') || 'nenhuma'} | trecho "${wc?.sources?.[0]?.snippet || ''}" | buscas ${usage.buscas || 0} | ${partes(usage)}`);
  return { wc, usage };
}
const r1 = await busca('dólar hoje', 'cotação do dólar hoje', 'claude:busca');
confere(r1.wc?.sources?.[0]?.url === 'https://cotacao.exemplo.com.br/dolar', 'a fonte citada vem primeiro');
confere(Math.abs(r1.usage.cost_usd - (14000 * 0.10 + 400 * 0.50) / 1e6 - 0.01) < 1e-9, `custo da busca = tokens + US$ 0,01 (US$ ${r1.usage.cost_usd?.toFixed(5)})`);
confere(!/Vou buscar/.test(r1.wc?.text || ''), 'o "vou buscar" de antes da busca não entra no resumo');
const r2 = await busca('2ª busca com erro de limite', 'placar do jogo duasBuscas', 'claude:busca');
confere(r2.wc?.text === '- O jogo terminou 2 a 1.' && r2.wc?.sources?.length === 1, `resumo só depois da última busca e as páginas da 1ª ("${r2.wc?.text}")`);
await busca('Claude recusa', 'cotação do dólar hoje recusa', 'claude:busca → or:deepseek/deepseek-v4.1-flash');
await busca('Claude responde sem buscar', 'cotação do dólar semBusca', 'claude:busca → or:deepseek/deepseek-v4.1-flash');
claudeFora = true;
await busca('Claude fora do ar (529)', 'cotação do dólar hoje', 'claude:fora → or:deepseek/deepseek-v4.1-flash');
claudeFora = false;
process.env.SEARCH_CLAUDE = '0';
await busca('SEARCH_CLAUDE=0', 'cotação do dólar hoje', 'or:deepseek/deepseek-v4.1-flash');
delete process.env.SEARCH_CLAUDE;

console.log('— leitor de anexos —');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PROIBIDA = Buffer.from('PROIBIDA-imagem').toString('base64'); // começa com UFJPSUJJ
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');
async function leitura(nome, item, esperado, extra = {}) {
  chamadas.length = 0;
  const usage = {};
  const conta = (modelo, data) => { (usage.partes ||= []).push({ p: 'anexo', m: modelo, usd: Number(data?.cost?.usd ?? data?.usage?.cost ?? 0) }); };
  const opcoes = { claudeKey: 'falsa', claudeUrl: `${base}/an/v1/messages`, ouKey: 'falsa', ouUrl: `${base}/ou/v1/chat/completions`, apiKey: 'falsa', orUrl: `${base}/or/api/v1/chat/completions`, referer: 'teste', conta, ...extra };
  const [m] = await digestAttachments([{ role: 'user', content: 'Veja.', attachments: [item] }], opcoes);
  const lido = /\[Conteúdo do anexo "[^"]+"\]\n(.*)\n\[Fim/.exec(m.content)?.[1] || '(não lido)';
  confere(chamadas.join(' → ') === esperado, `${nome}: ${chamadas.join(' → ')} | leu: "${lido}" | ${partes(usage)}`);
}
await leitura('foto comum', { kind: 'image', name: 'a.png', mime: 'image/png', data: PNG + 'A' }, 'claude:leitura:image');
await leitura('foto que o Claude recusa', { kind: 'image', name: 'b.png', mime: 'image/png', data: PROIBIDA }, 'claude:leitura:image → ou:inkling-2-mini-uncensored');
await leitura('PDF', { kind: 'pdf', name: 'c.pdf', mime: 'application/pdf', data: PDF, pages: 1 }, 'claude:leitura:document');
claudeFora = true;
await leitura('foto com o Claude fora do ar', { kind: 'image', name: 'd.png', mime: 'image/png', data: PNG + 'B' }, 'claude:fora → ou:inkling-2-mini-uncensored');
await leitura('PDF com o Claude fora do ar (Inkling não lê PDF)', { kind: 'pdf', name: 'e.pdf', mime: 'application/pdf', data: PDF + 'AAAA', pages: 1 }, 'claude:fora → or:qwen/qwen3.7-flash');
claudeFora = false;
await leitura('sem chave do Claude', { kind: 'image', name: 'f.png', mime: 'image/png', data: PNG + 'C' }, 'ou:inkling-2-mini-uncensored', { claudeKey: '' });

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
srv.close();
process.exit(falhas ? 1 : 0);
