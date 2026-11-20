// Teste do Parar/Cancelar. Uso: node cancelar.mjs <base> <dir-prints> <img>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, O, IMG] = process.argv.slice(2);
const fake = 'data:image/png;base64,' + readFileSync(IMG).toString('base64');
const mock = async (route) => { await new Promise((r) => setTimeout(r, 7000)); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ image: fake, prompt: 'x', formato: '1:1' }) }).catch(() => {}); };
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const r = {};
for (const [nome, vp] of [['computador', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, ...(nome === 'celular' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.route('**/api/image', mock); await p.route('**/api/image/intent', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: '{"intent":"new_image","prompt":"a cat"}' }));
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const pg = '.h-pagina[data-on]';
  const parar = () => p.locator(`${pg} [data-state=generating]`);
  // chat: parar no meio
  await p.locator(`${pg} textarea`).first().fill('Escreva um texto de 600 palavras sobre a história da criptografia.'); await p.keyboard.press('Enter');
  await p.waitForFunction((s) => (document.querySelector(s + ' .x-answer')?.textContent || '').length > 250, pg, { timeout: 60000 }).catch(() => {});
  r[nome + '_chat_botao_parar'] = await parar().count();
  await parar().first().click(); await p.waitForTimeout(600);
  const t1 = (await p.locator(`${pg} .x-answer`).last().innerText()).length;
  await p.waitForTimeout(4000);
  const t2 = (await p.locator(`${pg} .x-answer`).last().innerText()).length;
  r[nome + '_chat_parou'] = { antes: t1, depois4s: t2, aviso: await p.locator(`${pg} .h-parada`).innerText().catch(() => null), caixaLivre: await parar().count() === 0 };
  if (nome === 'celular') await p.screenshot({ path: `${O}/c1-celular-chat-parado.png` });
  // chat: imagem cancelada pelo botão Cancelar
  await p.locator(`${pg} textarea`).first().fill('gere uma imagem de um gato'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
  r[nome + '_chat_img_parar_na_caixa'] = await parar().count();
  await p.locator(`${pg} .h-cancelar`).first().click(); await p.waitForTimeout(800);
  r[nome + '_chat_img_cancelada'] = await p.locator(`${pg} .h-img-msg`).last().innerText();
  // imagens: cancelar pelo botão do card e pela caixa
  if (nome === 'celular') { await p.locator('.h-menu-btn').click(); await p.waitForTimeout(500); }
  await p.locator('.h-nav a', { hasText: 'Imagens' }).click(); await p.waitForTimeout(800);
  const antes = await p.locator(`${pg} .h-img-msg img`).count();
  await p.locator(`${pg} textarea`).first().fill('cidade na chuva'); await p.keyboard.press('Enter'); await p.waitForTimeout(1000);
  if (nome === 'celular') await p.screenshot({ path: `${O}/c2-celular-imagem-gerando.png` });
  await p.locator(`${pg} .h-cancelar`).first().click(); await p.waitForTimeout(300);
  await p.locator(`${pg} textarea`).first().fill('montanha'); await p.keyboard.press('Enter'); await p.waitForTimeout(1000);
  r[nome + '_img_parar_na_caixa'] = await parar().count();
  await parar().first().click(); await p.waitForTimeout(8000);
  r[nome + '_img_depois'] = { antes, depois: await p.locator(`${pg} .h-img-msg img`).count(), naFila: await p.locator(`${pg} .h-img-espera`).count(), caixaLivre: await parar().count() === 0 };
  r[nome + '_erros'] = erros;
  await ctx.close();
}
await b.close(); console.log(JSON.stringify(r, null, 1));
