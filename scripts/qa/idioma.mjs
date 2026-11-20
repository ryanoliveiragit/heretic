// Varredura de inglês nas telas do app (texto visível, title, aria-label, placeholder). Sem custo: conversa semeada.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, KEYFILE, OUT] = process.argv.slice(2);
const KEY = readFileSync(KEYFILE, 'utf8').trim();
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((k) => { if (!sessionStorage.getItem('i')) { localStorage.setItem('451-key', k); localStorage.setItem('451-chats-v3', JSON.stringify([{ id: 'c1', titulo: 'Teste', ts: Date.now(), msgs: [{ id: 1, tipo: 'ia', pergunta: 'oi', modelo: 'x', nomeModelo: '451 Rapid', resposta: 'Olá! **Teste** com `código`.\n\n```bash\nls\n```', custo: 0 }] }])); localStorage.setItem('451-ui', JSON.stringify({ pagina: 'chat', ativa: 'c1' })); sessionStorage.setItem('i', '1'); } }, KEY);
const p = await ctx.newPage(); await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
const EN = /\b(the|answer|stopped|copy|copied|share|regenerate|retry|send|stop|model|models|search|settings|cancel|close|attach|dictate|listening|transcribing|commands|good|bad|response|loading|error|something went wrong|ask anything|new chat|delete|rename|thinking|sources?|show more|less|details)\b/i;
const coleta = async (tela) => p.evaluate((t) => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; const s = n.textContent.trim(); const el = n.parentElement; if (s && el && el.offsetParent !== null && !el.closest('pre, code, .x-answer p, .x-answer li, [class*=codeBlock]')) out.push(['texto', s]); }
  for (const el of document.querySelectorAll('[title], [aria-label], [placeholder]')) for (const a of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v) out.push([a, v]); }
  return out.map(([k, v]) => ({ tela: t, k, v: v.slice(0, 90) }));
}, tela);
let todos = [...await coleta('chat')];
await p.locator('.x-answer').first().hover().catch(() => {});
todos.push(...await coleta('chat-hover'));
await p.locator('.h-nav a', { hasText: 'Imagens' }).click(); await p.waitForTimeout(800); todos.push(...await coleta('imagens'));
await p.locator('.h-cfg-link').click(); await p.waitForTimeout(800); todos.push(...await coleta('config'));
const achados = [...new Map(todos.filter((x) => EN.test(x.v) && !/451|Rapid|Titan|Max|Hermes|Kimi|Pix|Ctrl|@451chat|Suporte|API|Bash/.test(x.v.replace(EN, '')) || (EN.test(x.v) && /^[A-Za-z ,.'!?:-]+$/.test(x.v))).map((x) => [x.v, x])).values()].filter((x) => EN.test(x.v));
writeFileSync(OUT, JSON.stringify(achados, null, 1));
console.log(`${achados.length} textos com inglês:`); for (const a of achados) console.log(`  [${a.tela} · ${a.k}] ${a.v}`);
await b.close();
