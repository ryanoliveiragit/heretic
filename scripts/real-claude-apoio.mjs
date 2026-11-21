// Uso: node scripts/real-claude-apoio.mjs <pasta src> <pasta com nota.png e relatorio.pdf>
// Chamadas REAIS (poucas, custo estimado ~US$ 0,03): 1 busca pelo Claude Haiku (webContext), 1 foto do grátis
// (streamFoto) e 1 PDF pelo leitor de anexos. Sem OpenRouter (o estepe não é chamado), sem Redis.
// As chaves saem do cofre e não são impressas.
import { readFileSync } from 'node:fs';

const [dir, pasta] = process.argv.slice(2);
const cofre = '/home/ethical/.config/OpenBot/agent-api-keys/.vault/agent-93309c59-405f-4014-907c-1678704894c7';
for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_|OPENROUTER|CLAUDE|ANTHROPIC|OU_|SEARCH_|READER_|FOTO_)/.test(k)) delete process.env[k];
process.env.ANTHROPIC_API_KEY = readFileSync(`${cofre}/ANTHROPIC_API_KEY_VAGAS`, 'utf8').trim();
process.env.OU_API_KEY = readFileSync(`${cofre}/OU_API_KEY`, 'utf8').trim();
const { webContext, streamFoto } = await import(`${dir}/upstream.js`);
const { digestAttachments } = await import(`${dir}/attachments.js`);

const partes = (u) => (u.partes || []).map((p) => `${p.p}:${p.m} ${p.tin}+${p.tout} tok US$ ${Number(p.usd).toFixed(5)}`).join(' | ');
let total = 0;

// 1) busca
let t0 = Date.now(), usage = {};
const wc = await webContext('placar do último jogo do Flamengo', null, { usage });
console.log(`1) busca: ${((Date.now() - t0) / 1000).toFixed(1)} s | ${wc ? `${wc.sources.length} fontes: ${wc.sources.slice(0, 4).map((s) => new URL(s.url).hostname).join(', ')}` : 'NADA'} | ${partes(usage)}`);
console.log('   resumo:', (wc?.text || '').replace(/\n/g, ' / ').slice(0, 400));
console.log('   trecho da 1ª fonte:', wc?.sources?.[0]?.snippet?.slice(0, 160));
total += usage.cost_usd || 0;

if (process.env.SO === 'busca') { console.log(`total: US$ ${total.toFixed(5)}`); process.exit(0); }
// 2) foto do grátis
t0 = Date.now(); usage = {};
const png = readFileSync(`${pasta}/nota.png`).toString('base64');
let texto = '', avisos = [];
const payload = { messages: [{ role: 'user', content: 'Quanto deu o total dessa nota? E quais itens tem?', attachments: [{ kind: 'image', mime: 'image/png', name: 'nota.png', data: png }] }], systemPrompt: '' };
for await (const _ of streamFoto(payload, { onToken: (t) => { texto += t; }, onWarning: (w) => avisos.push(w.type), usage })) { /* */ }
console.log(`2) foto: ${((Date.now() - t0) / 1000).toFixed(1)} s | Claude ${usage.claude} | rota ${(usage.rota || []).join(' → ')} | avisos ${avisos.join(',') || '—'} | ${partes(usage)} | total US$ ${(usage.cost_usd || 0).toFixed(5)}`);
console.log('   resposta:', texto.replace(/\n/g, ' / ').slice(0, 400));
total += usage.cost_usd || 0;

// 3) PDF pelo leitor de anexos (o caminho dos sem censura e dos anexos antigos)
t0 = Date.now(); usage = { partes: [] };
const pdf = readFileSync(`${pasta}/relatorio.pdf`).toString('base64');
let custoPdf = 0;
const conta = (modelo, data) => { const u = data?.usage || {}; const usd = Number(data?.cost?.usd ?? u.cost ?? 0); custoPdf += usd; usage.partes.push({ p: 'anexo', m: modelo, tin: u.prompt_tokens || 0, tout: u.completion_tokens || 0, usd }); };
const [m] = await digestAttachments([{ role: 'user', content: 'Resuma.', attachments: [{ kind: 'pdf', mime: 'application/pdf', name: 'relatorio.pdf', data: pdf, pages: 1 }] }],
  { claudeKey: process.env.ANTHROPIC_API_KEY, claudeUrl: 'https://api.anthropic.com/v1/messages', ouKey: process.env.OU_API_KEY, ouUrl: 'https://api.openuncensored.com/v1/chat/completions', conta });
console.log(`3) PDF: ${((Date.now() - t0) / 1000).toFixed(1)} s | ${partes(usage)}`);
console.log('   leu:', m.content.replace(/\n/g, ' / ').slice(0, 300));
total += custoPdf;
console.log(`total das 3 chamadas: US$ ${total.toFixed(5)}`);
