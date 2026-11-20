// Teste da tela Imagens v2. Uso: node teste-tela.mjs <base> <dir-prints> <img1.webp> <img2.webp> <chave-pro-local>
// 1ª geração do Grátis é REAL (servidor local); as demais respondem com imagens de teste (marcadas "simulado").
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, O, IMG1, IMG2, PK] = process.argv.slice(2);
const fake = [IMG1, IMG2].map((f) => 'data:image/webp;base64,' + readFileSync(f).toString('base64'));
let n = 0;
const mock = async (route) => {
  const req = JSON.parse(route.request().postData() || '{}');
  await new Promise((r) => setTimeout(r, 1200));
  route.fulfill({ status: 200, contentType: 'application/json', body: '   ' + JSON.stringify({ image: fake[n++ % 2], prompt: 'simulated rewritten prompt for: ' + req.prompt, seed: 42, estilo: req.estilo, formato: req.formato, provider: 'simulado' }) });
};
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const res = {};
// ---------- computador, Grátis
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await p.getByText('Imagens', { exact: true }).first().click(); await p.waitForTimeout(900);
  res.gratisTravados = await p.evaluate(() => [...document.querySelectorAll('[role=radio],[role=tab],button')].filter((x) => /Realista|Sem filtro/.test(x.textContent || '')).map((x) => (x.textContent || '').trim() + ':' + (x.disabled || x.getAttribute('aria-disabled') === 'true' || x.hasAttribute('data-disabled'))));
  await p.screenshot({ path: `${O}/1-computador-gratis-vazio.png` });
  await p.locator('input[aria-label="Descrição da imagem"]').fill('uma cigarra metálica sobre um terminal verde antigo, com 451 na tela');
  await p.getByRole('button', { name: 'Gerar' }).click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${O}/2-computador-gerando.png` });
  const t0 = Date.now();
  await p.waitForSelector('.h-tile img, .h-tile-espera .h-erro', { timeout: 150000 }).catch(() => {});
  res.realSegundos = Math.round((Date.now() - t0) / 1000);
  res.realOk = await p.locator('.h-tile img').count();
  res.realErro = await p.locator('.h-tile-espera .h-erro').first().textContent().catch(() => null);
  await p.screenshot({ path: `${O}/3-computador-real.png` });
  await p.route('**/api/image', mock);
  for (const f of ['Paisagem', 'Retrato']) { await p.getByText(f, { exact: true }).first().click(); await p.locator('input[aria-label="Descrição da imagem"]').fill('teste ' + f); await p.getByRole('button', { name: 'Gerar' }).click(); await p.waitForTimeout(1800); }
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${O}/4-computador-galeria-simulado.png` });
  await p.locator('.h-tile').first().click(); await p.waitForTimeout(700);
  res.verAberto = await p.locator('.h-img-ver').count();
  res.aumentarGratis = await p.getByRole('button', { name: /Aumentar 2x/ }).first().isDisabled().catch(() => null);
  await p.screenshot({ path: `${O}/5-computador-visualizador.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500); res.escFecha = (await p.locator('.h-img-ver').count()) === 0;
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.getByText('Imagens', { exact: true }).first().click(); await p.waitForTimeout(900);
  res.galeriaDepoisDeRecarregar = await p.locator('.h-tile img').count();
  // chat: pedido de imagem e botões
  await p.getByText('Nova conversa', { exact: true }).first().click(); await p.waitForTimeout(800);
  await p.locator('textarea').first().fill('/imagem um gato hacker de capuz'); await p.keyboard.press('Enter'); await p.waitForTimeout(3500);
  res.chatAcoes = await p.locator('.h-img-msg .h-img-acoes .x-btn').allTextContents();
  await p.screenshot({ path: `${O}/6-computador-chat-simulado.png` });
  res.errosComputador = erros;
  await ctx.close();
}
// ---------- celular, Pro
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript((k) => { try { localStorage.setItem('451-key', k); } catch {} }, PK);
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.route('**/api/image', mock);
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await p.locator('button[aria-label*="menu" i], .h-menu-btn').first().click().catch(() => {}); await p.waitForTimeout(600);
  await p.getByText('Imagens', { exact: true }).first().click(); await p.waitForTimeout(900);
  await p.getByText('Sem filtro', { exact: true }).first().click(); await p.waitForTimeout(500);
  res.pedeIdade = await p.locator('.h-img-idade').count();
  res.gerarTravadoSemIdade = await p.getByRole('button', { name: 'Gerar' }).isDisabled();
  await p.screenshot({ path: `${O}/7-celular-pro-idade.png` });
  await p.getByRole('button', { name: 'Tenho 18 anos ou mais' }).click(); await p.waitForTimeout(400);
  for (const f of ['Vertical', 'Quadrada', 'Paisagem']) { await p.getByText(f, { exact: true }).first().click(); await p.locator('input[aria-label="Descrição da imagem"]').fill('teste ' + f); await p.getByRole('button', { name: 'Gerar' }).click(); await p.waitForTimeout(1800); }
  await p.waitForTimeout(800);
  res.larguraCelular = await p.evaluate(() => document.documentElement.scrollWidth);
  await p.screenshot({ path: `${O}/8-celular-galeria-simulado.png`, fullPage: false });
  await p.evaluate(() => { const s = document.querySelector('.p-pag'); if (s) s.scrollTop = 400; }); await p.waitForTimeout(500);
  await p.screenshot({ path: `${O}/9-celular-galeria-rolada.png` });
  await p.locator('.h-tile').first().click(); await p.waitForTimeout(700);
  res.aumentarPro = await p.getByRole('button', { name: /Aumentar 2x/ }).first().isEnabled().catch(() => null);
  await p.screenshot({ path: `${O}/10-celular-visualizador.png` });
  res.errosCelular = erros;
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
await b.close();
