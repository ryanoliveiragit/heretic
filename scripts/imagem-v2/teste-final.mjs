// Teste final com o motor REAL (RunPod) e LLM real: página Imagens (formato chat), apagar, fluxograma, faixa adulta.
import { createRequire } from 'node:module';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, O, PK] = process.argv.slice(2);
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const res = {};
const ate = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true).catch(() => false);
{ // computador, Grátis
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' });
  await p.getByText('Imagens', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${O}/f1-imagens-vazia.png` });
  res.estilosNoSeletor = await p.locator('textarea').count();
  await p.locator('textarea').first().fill('uma cigarra cromada sobre um teclado mecânico, luz neon, foto macro'); await p.keyboard.press('Enter');
  res.imagemPagina = await ate(p, () => document.querySelectorAll('.h-img-feed .h-img-gerada').length >= 1, null, 150000);
  res.sugestoesPagina = await ate(p, () => document.querySelectorAll('.h-img-feed .h-img-sug .x-chip').length >= 1, null, 30000);
  await p.screenshot({ path: `${O}/f2-imagens-feed.png` });
  const antes = await p.locator('.h-img-feed .h-img-gerada').count();
  await p.locator('.h-img-feed .h-img-acoes').last().getByRole('button', { name: 'Apagar' }).click(); await p.waitForTimeout(600);
  res.apagouNaPagina = antes - await p.locator('.h-img-feed .h-img-gerada').count();
  // chat: imagem + apagar
  await p.getByText('Nova conversa', { exact: true }).first().click(); await p.waitForTimeout(800);
  await p.locator('textarea').first().fill('me faz uma foto de um gato preto num telhado à noite'); await p.keyboard.press('Enter');
  res.imagemChat = await ate(p, () => document.querySelectorAll('.h-img-msg img').length >= 1, null, 150000);
  await p.screenshot({ path: `${O}/f3-chat-imagem.png` });
  await p.locator('.h-img-msg').last().getByRole('button', { name: 'Apagar' }).click(); await p.waitForTimeout(600);
  res.apagouNoChat = (await p.locator('.h-img-msg img').count()) === 0;
  // fluxograma
  await p.getByText('Nova conversa', { exact: true }).first().click(); await p.waitForTimeout(800);
  await p.locator('textarea').first().fill('Faça um fluxograma em mermaid (flowchart TD) das etapas de um pentest web, com uma decisão "Vulnerável?"'); await p.keyboard.press('Enter');
  res.fluxograma = await ate(p, () => !!document.querySelector('.hx-mmd-card svg'), null, 150000);
  await p.waitForTimeout(2500);
  await p.locator('.hx-mmd-card').first().scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${O}/f4-fluxograma.png` });
  res.caixasNoFluxo = await p.locator('.hx-mmd-card .node').count();
  res.errosComputador = erros;
  await ctx.close();
}
{ // celular, Pro, faixa adulta na página Imagens
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript((k) => { try { localStorage.setItem('451-key', k); localStorage.setItem('451-imagem-prefs', JSON.stringify({ estilo: 'sem-filtro', formato: '3:4', melhorar: true, adulto: false })); } catch {} }, PK);
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' });
  await p.locator('button[aria-label*="menu" i], .h-menu-btn').first().click().catch(() => {}); await p.waitForTimeout(600);
  await p.getByText('Imagens', { exact: true }).first().click(); await p.waitForTimeout(1200);
  res.pedeIdadePagina = await p.locator('.h-img-idade').count();
  await p.screenshot({ path: `${O}/f5-celular-imagens-idade.png` });
  await p.getByRole('button', { name: 'Tenho 18 anos ou mais' }).first().click(); await p.waitForTimeout(400);
  await p.locator('textarea').first().fill('retrato artístico em estúdio de uma mulher adulta de 35 anos, luz de recorte, preto e branco'); await p.keyboard.press('Enter');
  res.imagemChromaCelular = await ate(p, () => document.querySelectorAll('.h-img-feed .h-img-gerada').length >= 1, null, 180000);
  res.larguraCelular = await p.evaluate(() => document.documentElement.scrollWidth);
  await p.screenshot({ path: `${O}/f6-celular-feed.png` });
  res.errosCelular = erros;
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
await b.close();
