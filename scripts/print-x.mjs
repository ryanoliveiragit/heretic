// Uso: node scripts/print-x.mjs <arquivo da chave> <modelo> <pergunta> <saída.png> [abre-fontes]
// Print REAL do app no ar para post: manda a pergunta no 451sh.com e recorta só a conversa (pergunta, fontes e
// resposta), na largura do celular (390 px × 2 = 780 px). Sem cabeçalho (créditos), sem rodapé (plano) e sem caixa.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [ARQ, MODELO, PERGUNTA, SAIDA] = process.argv.slice(2);
const KEY = readFileSync(ARQ, 'utf8').trim();
const b = await PW.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 2400 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript(([k, m]) => { try { localStorage.setItem('451-key', k); localStorage.setItem('451-model', m); } catch { /* */ } }, [KEY, MODELO]);
const page = await ctx.newPage();
const erros = []; page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
await page.goto('https://451sh.com/app/', { waitUntil: 'networkidle' });
const caixa = page.locator('textarea').first();
await caixa.waitFor({ timeout: 30000 });
const resp = page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 60000 });
await caixa.fill(PERGUNTA);
await caixa.press('Enter');
const r = await resp;
const corpo = Buffer.from(await r.body()).toString('utf8');
const avisos = corpo.split('\n\n').filter((x) => x.startsWith('event: warning')).map((x) => { try { return JSON.parse(x.split('data: ')[1]); } catch { return null; } }).filter(Boolean);
await page.waitForTimeout(5000); // a resposta termina de aparecer na tela
const alvo = page.locator('.x-answer').last();
// 5º argumento "abre-fontes": abre a lista de fontes antes do print (mostra os sites).
if (process.argv[6] === 'abre-fontes') { await alvo.getByText(/\d+ fontes?/).first().click().catch(() => {}); await page.waitForTimeout(1200); }
// O app desenha um círculo no cursor: leva o mouse para fora do recorte antes do print.
await page.mouse.move(386, 4); await page.waitForTimeout(1500);
const box = await alvo.boundingBox();
const texto = await alvo.innerText();
await page.screenshot({ path: SAIDA, clip: { x: 0, y: Math.max(0, box.y - 14), width: 390, height: Math.min(box.height + 22, 2400 - box.y) } });
console.log(JSON.stringify({
  http: r.status(), buscou: avisos.some((w) => w.type === 'search'), fontes: (avisos.find((w) => w.type === 'sources')?.sources || []).map((s) => s.url),
  etapas: avisos.filter((w) => w.type === 'step').map((w) => w.title), trocas: avisos.filter((w) => /refusal|escalat|rerout/.test(w.type)).map((w) => w.type),
  print: `${SAIDA} (${Math.round(390 * 2)} × ${Math.round(Math.min(box.height + 22, 2400 - box.y) * 2)} px)`,
  tem_credito_plano_ou_preco_no_recorte: /créditos?|R\$|plano|Pro\b|grátis/i.test(texto), texto_no_recorte: texto.slice(0, 400), erros_de_pagina: erros,
}, null, 1));
await b.close();
