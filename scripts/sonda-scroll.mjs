// Uso: node scripts/sonda-scroll.mjs <url do app>
// Sonda do scroll no celular: (1) os toques do CDP chegam à página e rolam a conversa? (2) com a resposta chegando,
// se o dedo leva a conversa para trás (rolagem durante um toque), a rolagem automática respeita e não volta ao fim?
import { createRequire } from 'node:module';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [URL] = process.argv.slice(2);
const b = await PW.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  try { localStorage.setItem('451-model', 'local:gptoss20b'); } catch { /* */ }
  window.__toques = { start: 0, move: 0, end: 0 };
  addEventListener('touchstart', () => window.__toques.start++, { passive: true, capture: true });
  addEventListener('touchmove', () => window.__toques.move++, { passive: true, capture: true });
  addEventListener('touchend', () => window.__toques.end++, { passive: true, capture: true });
});
const page = await ctx.newPage();
const erros = []; page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
await page.goto(URL, { waitUntil: 'networkidle' });
const cdp = await ctx.newCDPSession(page);
const caixa = page.locator('textarea').first();
await caixa.waitFor({ timeout: 30000 });
await caixa.fill('Me dê uma resposta bem longa sobre redes de computadores, com muitos tópicos.');
await caixa.press('Enter');
const vp = page.locator('section.h-scroll-vp').first();
const med = () => vp.evaluate((n) => ({ dist: Math.round(n.scrollHeight - n.scrollTop - n.clientHeight), top: Math.round(n.scrollTop), alto: n.scrollHeight }));
// espera a resposta passar de ~1.400 px além da tela (até 90 s), para o dedo ter para onde levar a conversa
for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); if ((await vp.evaluate((n) => n.scrollHeight - n.clientHeight)) > 1400) break; }
console.log('antes:', JSON.stringify(await med()));

// (1) toque do CDP: chega à página? rola?
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 250, id: 1 }] });
for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 250 + i * 25, id: 1 }] }); await page.waitForTimeout(16); }
const meio = await med();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(300);
console.log('(1) toques que chegaram:', JSON.stringify(await page.evaluate(() => window.__toques)), '| no meio do gesto:', JSON.stringify(meio), '| depois:', JSON.stringify(await med()));

// (2) rolagem do dedo simulada: touchstart, a conversa sobe 600 px, touchend; a resposta continua chegando
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 300, id: 2 }] });
await vp.evaluate((n) => { n.scrollTop = Math.max(0, n.scrollTop - 600); n.dispatchEvent(new Event('scroll')); });
await page.waitForTimeout(120);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const logo = await med();
await page.waitForTimeout(3000);
const depois = await med();
console.log(`(2) logo depois do dedo: ${logo.dist} px do fim; 3 s depois, com mais texto: ${depois.dist} px (altura ${logo.alto} → ${depois.alto}) → ${depois.dist >= 300 ? 'RESPEITOU o dedo' : 'VOLTOU ao fim'}`);
console.log('erros de página:', erros.length ? erros : 'nenhum');
await b.close();
