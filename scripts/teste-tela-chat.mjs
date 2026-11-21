// Uso: node scripts/teste-tela-chat.mjs <url do app local> <pasta dos prints>
// Tela do chat (v2) contra um provedor falso: o bloco ```ask vira cartão de opções clicável e os
// gráficos (```mermaid pie, ```chart com xychart-beta e ```chart em JSON) viram desenho, não código cru.
import { createRequire } from 'node:module';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [URL, OUT] = process.argv.slice(2);
const b = await PW.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
await page.goto(URL, { waitUntil: 'networkidle' });
const caixa = page.locator('textarea').first();
await caixa.waitFor({ timeout: 20000 });
await caixa.fill('teste de formato');
await caixa.press('Enter');
await page.waitForSelector('[role="radiogroup"]', { timeout: 40000 }).catch(() => {});
await page.waitForTimeout(6000); // a resposta terminar de aparecer e o Mermaid desenhar
const grupos = await page.locator('[role="radiogroup"]').count();
const opcoes = await page.locator('[role="radiogroup"] [role="radio"]').count();
const habilitadas = await page.locator('[role="radiogroup"] [role="radio"]:not([disabled]):not([aria-disabled="true"])').count();
const cru = await page.getByText(/^(ask|chart)$/).count();
const mermaid = await page.locator('.hx-mermaid svg').count();
const nomes = await page.locator('.hx-mmd-tag').allInnerTexts();
const graficos = {};
for (const t of ['Vulnerabilidades por severidade', 'Achados por semana', 'Chamados por mês', 'Origem dos acessos']) graficos[t] = (await page.getByLabel(t).count()) ? 'sim' : 'NÃO';
console.log(`cartão de opções: ${grupos} | opções: ${opcoes} (${habilitadas} clicáveis) | blocos "ask"/"chart" em código cru: ${cru}`);
console.log(`gráficos da ryan-ui: ${JSON.stringify(graficos)}`);
console.log(`Mermaid desenhados: ${mermaid} (${nomes.join(', ')})`);
const shot = async (nome, alvo) => { await alvo.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${nome}.png` }); };
await shot('1-opcoes', page.locator('[role="radiogroup"]').first());
await shot('2-pizza-mermaid', page.getByLabel('Vulnerabilidades por severidade').first());
await shot('3-barras-mermaid', page.getByLabel('Achados por semana').first());
await shot('4-barras-json', page.getByLabel('Chamados por mês').first());
await shot('5-pizza-json', page.getByLabel('Origem dos acessos').first());
await shot('6-fluxograma', page.locator('.hx-mermaid').last());
// um toque numa opção manda a próxima mensagem
const pedido = page.waitForRequest((r) => r.url().includes('/api/chat') && r.method() === 'POST', { timeout: 15000 }).catch(() => null);
await page.locator('[role="radiogroup"] [role="radio"]').first().click().catch((e) => console.log('clique falhou:', String(e).slice(0, 120)));
const r = await pedido;
const enviado = r ? (JSON.parse(r.postData() || '{}').messages || []).filter((m) => m.role === 'user').pop()?.content : null;
console.log(`toque na 1ª opção enviou: ${enviado ? JSON.stringify(enviado) : 'NADA'}`);
await page.waitForTimeout(2500);
const perguntas = await page.getByText('Web/API', { exact: true }).count();
console.log(`"Web/API" aparece ${perguntas}x na tela (opção + nova mensagem)`);
console.log('erros de página:', erros.length ? erros : 'nenhum');
await b.close();
