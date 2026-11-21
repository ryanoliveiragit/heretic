// Uso: node scripts/no-ar-tela-chat.mjs <arquivo com a chave de admin> <pasta dos prints>
// UMA mensagem real no app publicado (custo estimado ~R$ 0,13), como admin: confere se o gráfico e o
// cartão de opções aparecem desenhados. Não clica em opção (seria uma 2ª mensagem paga).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [ARQ, OUT] = process.argv.slice(2);
const KEY = readFileSync(ARQ, 'utf8').trim();
const b = await PW.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript((k) => { try { localStorage.setItem('451-key', k); } catch {} }, KEY);
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
let pedidos = 0;
page.on('request', (r) => { if (r.url().includes('/api/chat') && r.method() === 'POST') pedidos++; });
await page.goto('https://451sh.com/app/', { waitUntil: 'networkidle' });
const caixa = page.locator('textarea').first();
await caixa.waitFor({ timeout: 30000 });
await caixa.fill('Mostre num gráfico de pizza a divisão dos achados: Web 50, Rede 30, Mobile 20. Depois me pergunte, com opções, qual área quero detalhar.');
await caixa.press('Enter');
// espera a resposta terminar: as ações (copiar, refazer) aparecem no fim
await page.waitForSelector('[role="radiogroup"]', { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(8000);
const grupos = await page.locator('[role="radiogroup"]').count();
const opcoes = await page.locator('[role="radiogroup"] [role="radio"]').count();
const habilitadas = await page.locator('[role="radiogroup"] [role="radio"]:not([disabled]):not([aria-disabled="true"])').count();
const cru = await page.getByText(/^(ask|chart|mermaid)$/).count();
const rosca = await page.locator('figure svg, [class*="ring"] svg').count();
const mermaid = await page.locator('.hx-mermaid svg').count();
console.log(`pedidos ao /api/chat: ${pedidos} | cartão de opções: ${grupos} (${opcoes} opções, ${habilitadas} clicáveis) | blocos em código cru: ${cru} | desenhos: rosca/gráfico ${rosca}, Mermaid ${mermaid}`);
await page.locator('[role="radiogroup"]').first().scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/2-opcoes.png` });
await page.evaluate(() => window.scrollTo(0, 0));
const alvo = page.getByText(/Total/).first();
await alvo.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/1-grafico.png` });
console.log('erros de página:', erros.length ? erros : 'nenhum');
await b.close();
