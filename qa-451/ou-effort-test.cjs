// Mede o efeito do parâmetro de raciocínio com um problema de múltiplos passos (resposta verificável).
const fs = require('fs');
const KEY = fs.readFileSync('/home/ethical/.config/OpenBot/agent-api-keys/.vault/agent-93309c59-405f-4014-907c-1678704894c7/OU_API_KEY', 'utf8').trim();
const BASE = 'https://api.openuncensored.com/v1/messages';
const MODEL = 'deepseek-v4.1-flash-1017-uncensored-thinking';
const extra = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const body = {
  model: MODEL,
  max_tokens: 4096,
  system: 'Você é calculista. Resolva mostrando cada passo. Responda em português.',
  messages: [{ role: 'user', content: 'Calcule o valor final, mostrando cada passo: comece com 100, some 25, multiplique por 2, subtraia 30, divida por 5, eleve o resultado ao quadrado e some 10. Diga o número final na última linha, sozinho.' }],
  stream: false,
  ...extra,
};
const t0 = Date.now();
fetch(BASE, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) })
  .then(async r => {
    const d = await r.json().catch(() => ({}));
    const blocks = d.content || [];
    const text = blocks.filter(b => b.type === 'text').map(b => b.text || '').join('');
    const thinkLen = blocks.filter(b => b.type === 'thinking').reduce((a, b) => a + String(b.thinking || '').length, 0);
    const m = String(text).match(/-?\d[\d.,]*\s*$/m);
    console.log(JSON.stringify({
      variante: process.argv[2] || 'baseline',
      status: r.status, ms: Date.now() - t0,
      out: (d.usage || {}).output_tokens, in: (d.usage || {}).input_tokens,
      thinkChars: thinkLen,
      final: m ? m[0].trim() : null,
      textoFim: String(text).slice(-120).replace(/\n/g, ' | '),
    }));
  }).catch(e => console.log('ERRO', e.message));
