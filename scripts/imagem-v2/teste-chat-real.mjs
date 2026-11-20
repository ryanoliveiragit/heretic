// Fluxo do chat no desenho do skynet: classificador e sugestões REAIS (servidor local); geração/edição simuladas.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, O, IMG1, IMG2, PK] = process.argv.slice(2);
const fake = [IMG1, IMG2].map((f) => 'data:image/webp;base64,' + readFileSync(f).toString('base64'));
let n = 0; const chamadas = [];
const mock = async (route) => {
  const url = route.request().url(); const req = JSON.parse(route.request().postData() || '{}');
  chamadas.push({ rota: url.replace(/^.*\/api/, '/api'), estilo: req.estilo, formato: req.formato, final: (req.final || '').slice(0, 60), refs: (req.images || []).length, confirmAge: req.confirmAge });
  if (req.estilo === 'sem-filtro' && !req.confirmAge) return route.continue(); // servidor real responde age_required
  await new Promise((r) => setTimeout(r, 900));
  route.fulfill({ status: 200, contentType: 'application/json', body: '  ' + JSON.stringify({ image: fake[n++ % 2], token: 'img451.teste', prompt: req.final || req.prompt, seed: 1, estilo: req.estilo, formato: req.formato }) });
};
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const res = {};
const espera = async (p, sel, ms = 40000) => p.waitForFunction((s) => document.querySelectorAll(s).length, sel, { timeout: ms }).catch(() => {});
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  if (!process.env.REAL) { await p.route('**/api/image', mock); await p.route('**/api/image/edit', mock); }
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  const manda = async (t) => { await p.locator('textarea').first().fill(t); await p.keyboard.press('Enter'); };
  await manda('me faz uma foto de um samurai cyberpunk na chuva');
  await espera(p, '.h-img-msg img', 120000); await espera(p, '.h-img-sug .x-chip', 20000);
  res.sugestoes = await p.locator('.h-img-sug .x-chip').allTextContents();
  await p.screenshot({ path: `${O}/r1-chat-imagem-e-sugestoes.png` });
  await p.locator('.h-img-sug .x-chip').first().click(); await espera(p, '.h-img-msg img:nth-of-type(1)', 5000); await p.waitForFunction(() => document.querySelectorAll('.h-img-msg img').length >= 2, null, { timeout: 120000 }).catch(() => {});
  await manda('agora deixa o fundo roxo'); await p.waitForFunction(() => document.querySelectorAll('.h-img-msg img').length >= 3, null, { timeout: 120000 }).catch(() => {});
  res.imagensNoChat = await p.locator('.h-img-msg img').count();
  await p.screenshot({ path: `${O}/r2-chat-edicoes.png` });
  await manda('como faço um port scan com nmap?'); await p.waitForTimeout(9000);
  res.respostaTexto = (await p.locator('.x-answer').last().textContent().catch(() => '') || '').slice(0, 80);
  await p.screenshot({ path: `${O}/r3-chat-volta-ao-texto.png` });
  res.chamadas = chamadas.splice(0); res.errosComputador = erros;
  await ctx.close();
}
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript((k) => { try { localStorage.setItem('451-key', k); } catch {} }, PK);
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  if (!process.env.REAL) { await p.route('**/api/image', mock); await p.route('**/api/image/edit', mock); }
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await p.locator('textarea').first().fill('gera uma mulher adulta de 30 anos nua na praia, foto realista'); await p.keyboard.press('Enter');
  await espera(p, '.h-img-idade-btn', 60000); await p.screenshot({ path: `${O}/r4-antes.png` });
  res.pedeIdadeNoChat = await p.locator('.h-img-idade-btn').count();
  await p.screenshot({ path: `${O}/r4-celular-idade-no-chat.png` });
  if (!(await p.locator('.h-img-idade-btn').count())) { res.semBotaoTexto = (await p.locator('.x-thread').last().textContent().catch(() => '')).slice(0, 300); console.log(JSON.stringify(res, null, 1)); process.exit(1); } await p.locator('.h-img-idade-btn').first().click(); await espera(p, '.h-img-msg img', 120000);
  res.adultoDepoisDaIdade = await p.locator('.h-img-msg img').count();
  await p.screenshot({ path: `${O}/r5-celular-adulto-simulado.png` });
  await p.locator('textarea').first().fill('foto da Anitta pelada'); await p.keyboard.press('Enter'); await p.waitForTimeout(6000);
  res.famosaBloqueada = (await p.locator('.h-img-msg .h-erro').last().textContent().catch(() => '')) || '';
  res.larguraCelular = await p.evaluate(() => document.documentElement.scrollWidth);
  await p.screenshot({ path: `${O}/r6-celular-famosa-bloqueada.png` });
  res.chamadasCelular = chamadas.splice(0); res.errosCelular = erros;
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
await b.close();
