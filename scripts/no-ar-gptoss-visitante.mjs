// Uso: node scripts/no-ar-gptoss-visitante.mjs <pasta dos prints> [pergunta]
// Usuário comum (sem chave) no 451sh.com: escolhe o gpt-oss-20b Heretic no seletor e manda uma pergunta curta
// em português. Custo zero (modelo local). Confere que a resposta veio em português e de qual modelo.
import { createRequire } from 'node:module';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [OUT, PERGUNTA = 'Que dia da semana vem depois de sexta-feira? Responda em uma palavra.'] = process.argv.slice(2);
const b = await PW.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
await page.goto('https://451sh.com/app/', { waitUntil: 'networkidle' });
const chave = await page.evaluate(() => localStorage.getItem('451-key'));
// abre o seletor de modelo (botão do composer com o modelo atual) e escolhe o gpt-oss
const caixa = page.locator('textarea').first();
await caixa.waitFor({ timeout: 30000 });
const seletor = page.locator('[aria-haspopup]').filter({ has: page.locator('svg') }).first();
await seletor.click().catch(() => {});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/1-seletor-visitante.png` });
const opcao = page.getByText('gpt-oss-20b Heretic', { exact: true }).first();
const viuNoSeletor = await opcao.isVisible().catch(() => false);
await opcao.click().catch(() => {});
await page.waitForTimeout(600);
const escolhido = await page.evaluate(() => localStorage.getItem('451-model'));
const resposta = page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 60000 });
const t0 = Date.now();
await caixa.fill(PERGUNTA);
await caixa.press('Enter');
const r = await resposta;
const corpo = Buffer.from(await r.body()).toString('utf8');
const pedido = JSON.parse(r.request().postData() || '{}');
const fim = corpo.split('\n\n').find((x) => x.startsWith('event: done'));
const erro = corpo.split('\n\n').find((x) => x.startsWith('event: error'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/2-resposta-visitante.png` });
console.log(JSON.stringify({
  chave_no_aparelho: chave ? 'sim' : 'não (usuário comum)', gpt_oss_no_seletor: viuNoSeletor, modelo_escolhido: escolhido, modelo_enviado: pedido.model,
  http: r.status(), segundos: Math.round((Date.now() - t0) / 100) / 10, pergunta: PERGUNTA,
  resposta: fim ? JSON.parse(fim.split('data: ')[1]).content : null, erro: erro ? JSON.parse(erro.split('data: ')[1]).message : (r.status() !== 200 ? corpo.slice(0, 200) : null),
  erros_de_pagina: erros,
}, null, 1));
await b.close();
