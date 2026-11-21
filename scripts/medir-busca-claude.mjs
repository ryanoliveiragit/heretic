// Uso: node scripts/medir-busca-claude.mjs "consulta"
// Mede UMA busca real pelo Claude Haiku 5.5 com a ferramenta de busca (máx. 1 busca): custo, fontes e texto.
// Custo estimado por chamada: ~US$ 0,012 (US$ 0,01 da busca + tokens). A chave sai do cofre e não é impressa.
import { readFileSync } from 'node:fs';

const key = readFileSync('/home/ethical/.config/OpenBot/agent-api-keys/.vault/agent-93309c59-405f-4014-907c-1678704894c7/ANTHROPIC_API_KEY_VAGAS', 'utf8').trim();
const consulta = process.argv[2] || 'cotação do dólar hoje';
const sistema = 'Busque na web e resuma os FATOS PRINCIPAIS de forma objetiva e curta, em português, em bullets (máx. 8 linhas). Só fatos verificáveis, com números e datas exatos.';
const t0 = Date.now();
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model: 'claude-haiku-5-5', max_tokens: 600, system: sistema,
    messages: [{ role: 'user', content: consulta }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1, user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' } }],
  }),
});
const ms = Date.now() - t0;
const data = await res.json();
if (!res.ok) { console.log('HTTP', res.status, JSON.stringify(data).slice(0, 400)); process.exit(1); }
const u = data.usage || {};
const buscas = u.server_tool_use?.web_search_requests || 0;
const usd = (u.input_tokens || 0) * 0.10 / 1e6 + (u.cache_creation_input_tokens || 0) * 0.125 / 1e6 + (u.cache_read_input_tokens || 0) * 0.01 / 1e6 + (u.output_tokens || 0) * 0.50 / 1e6 + buscas * 0.01;
const resultados = data.content.filter((b) => b.type === 'web_search_tool_result').flatMap((b) => (Array.isArray(b.content) ? b.content : []));
const erro = data.content.find((b) => b.type === 'web_search_tool_result' && !Array.isArray(b.content))?.content;
const texto = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
const citacoes = data.content.filter((b) => b.type === 'text').flatMap((b) => b.citations || []);
console.log(`tempo ${(ms / 1000).toFixed(1)} s | parada ${data.stop_reason} | buscas ${buscas} | entrada ${u.input_tokens} tok | saída ${u.output_tokens} tok | custo US$ ${usd.toFixed(5)}`);
if (erro) console.log('erro da busca:', JSON.stringify(erro));
console.log(`resultados ${resultados.length}:`, resultados.map((r) => `${new URL(r.url).hostname} (${r.page_age || 'sem data'})`).join(', '));
console.log(`citações ${citacoes.length}; exemplo:`, JSON.stringify(citacoes[0] ? { url: citacoes[0].url, title: citacoes[0].title, cited_text: String(citacoes[0].cited_text).slice(0, 120) } : null));
console.log('texto:', texto.slice(0, 700));
