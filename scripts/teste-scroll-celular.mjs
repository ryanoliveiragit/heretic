// Uso: node scripts/teste-scroll-celular.mjs <url do app> <pasta dos prints>
// Scroll no celular (dono 21/11): celular simulado (390 px, toque). Confere que nenhum ouvinte de toque bloqueia a
// rolagem, que a trilha de navegação não roda no celular e que, com a resposta chegando, um gesto do dedo para cima
// não é desfeito pela rolagem automática.
import { createRequire } from 'node:module';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [URL, OUT] = process.argv.slice(2);
const b = await PW.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('451-model', 'local:gptoss20b'); } catch { /* */ } });
const page = await ctx.newPage();
const erros = []; page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
await page.goto(URL, { waitUntil: 'networkidle' });
const cdp = await ctx.newCDPSession(page);
const { result } = await cdp.send('Runtime.evaluate', { expression: 'window' });
const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
const toque = listeners.filter((l) => /^touch/.test(l.type)).map((l) => `${l.type}${l.passive ? ' (passivo)' : ' (BLOQUEIA)'}`);
console.log('ouvintes de toque na janela:', toque.join(', ') || 'nenhum');
const caixa = page.locator('textarea').first();
await caixa.waitFor({ timeout: 30000 });
await caixa.fill('Me dê uma resposta bem longa.');
await caixa.press('Enter');
const vp = page.locator('section.h-scroll-vp').first();
// espera a resposta passar de ~1.400 px além da tela (até 90 s): com resposta curta o dedo não tem para onde rolar
for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); if ((await vp.evaluate((n) => n.scrollHeight - n.clientHeight)) > 1400) break; }
const dist = () => vp.evaluate((n) => Math.round(n.scrollHeight - n.scrollTop - n.clientHeight));
console.log('trilha de navegação no celular:', await page.locator('.h-rail').count() ? 'existe' : 'não roda');
console.log('distância do fim com a resposta chegando (acompanhando):', await dist(), 'px');
// gesto de dedo para cima (rola a conversa para trás), como numa tela de toque
// Toque de verdade (o synthesizeScrollGesture não gera eventos de toque no navegador sem tela): o dedo desce
// 500 px em 20 passos, o que rola a conversa para trás.
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 250 }] });
for (let i = 1; i <= 20; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 250 + i * 25 }] });
  await page.waitForTimeout(16);
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(300);
const logo = await dist();
await page.waitForTimeout(3000); // a resposta continua chegando
const depois = await dist();
console.log(`depois do dedo: ${logo} px do fim; 3 s depois, com mais texto chegando: ${depois} px (bom = continua longe do fim)`);
await page.screenshot({ path: `${OUT}/scroll-celular.png` });
await page.waitForTimeout(6000);
console.log('erros de página:', erros.length ? erros : 'nenhum');
await b.close();
