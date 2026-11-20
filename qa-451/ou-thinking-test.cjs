// Testa se o OpenUncensored (Anthropic-compat) aceita parâmetro de raciocínio.
const fs = require('fs');
const KEY = fs.readFileSync('/home/ethical/.config/OpenBot/agent-api-keys/.vault/agent-93309c59-405f-4014-907c-1678704894c7/OU_API_KEY', 'utf8').trim();
const BASE = 'https://api.openuncensored.com/v1/messages';
const MODEL = 'deepseek-v4.1-flash-1017-uncensored-thinking';

const extra = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const body = {
  model: MODEL,
  max_tokens: 2048,
  system: 'Responda curto.',
  messages: [{ role: 'user', content: 'Qual o sentido da vida? Responda em 2 frases.' }],
  stream: false,
  ...extra,
};
const t0 = Date.now();
fetch(BASE, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) })
  .then(async r => {
    const d = await r.json().catch(() => ({}));
    const usage = d.usage || {};
    console.log(JSON.stringify({
      variante: Object.keys(extra).join(',') || 'baseline',
      status: r.status,
      ms: Date.now() - t0,
      stop: d.stop_reason,
      err: d.error ? (d.error.message || JSON.stringify(d.error)).slice(0, 160) : null,
      usage: { in: usage.input_tokens, out: usage.output_tokens, thinking: usage.thinking_tokens ?? null, total: usage.total_tokens ?? null },
      texto: String(d.content?.map(b => b.text || '').join('') || '').slice(0, 120),
    }, null, 1));
  }).catch(e => console.log('ERRO', e.message));
