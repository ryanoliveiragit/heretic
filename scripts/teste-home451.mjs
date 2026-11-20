// Teste da home nova do 451.sh: prints por seção (computador e celular), estouro lateral, erros, links e a caixa.
// Uso: node teste-home451.mjs <base-url> <pasta-saida>
import { createRequire } from 'node:module';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, OUT] = process.argv.slice(2);
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const erros = [];
for (const [w, h, mob, nome] of [[1440, 900, false, 'pc'], [390, 844, true, 'cel']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mob ? 2 : 1, isMobile: mob, hasTouch: mob });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`${nome} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(`${nome} console: ${m.text().slice(0, 160)}`); });
  p.on('response', (r) => { if (r.status() >= 400 && !/_vercel/.test(r.url())) erros.push(`${nome} HTTP ${r.status()} ${r.url()}`); });
  await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(3000);
  // quadros por segundo (página não pode travar)
  const fps = await p.evaluate(() => new Promise((ok) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else ok(Math.round(n / 2)); }; requestAnimationFrame(f); }));
  const info = await p.evaluate(() => {
    const sc = document.querySelector('[data-scroller]');
    const larg = Math.max(document.documentElement.scrollWidth, sc ? sc.scrollWidth : 0);
    const links = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    const largos = [...document.querySelectorAll('.l *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed').slice(0, 5).map((e) => e.className && String(e.className).slice(0, 40));
    return { larg, altura: sc ? sc.scrollHeight : 0, links: [...new Set(links)], largos };
  });
  console.log(nome, 'fps', fps, 'largura', info.larg, 'altura', info.altura, 'passam da borda:', JSON.stringify(info.largos));
  if (nome === 'pc') console.log('links:', info.links.join(' '));
  const sc = p.locator('[data-scroller]');
  for (let y = 0, i = 1; y < info.altura && i <= 16; y += h, i++) {
    await sc.evaluate((el, v) => { el.style.scrollBehavior = 'auto'; el.scrollTop = v; }, y);
    await p.waitForTimeout(1400);
    await p.screenshot({ path: `${OUT}/${nome}-${String(i).padStart(2, '0')}.png` });
  }
  if (nome === 'pc') {
    await sc.evaluate((el) => { el.scrollTop = 0; }); await p.waitForTimeout(600);
    await p.locator('.l-hero textarea').first().fill('Como eu testo a segurança do meu site?');
    await p.keyboard.press('Enter'); await p.waitForTimeout(2500);
    console.log('caixa leva para:', p.url().replace(BASE, ''));
    await p.waitForTimeout(6000);
    console.log('no app chegou mensagem:', await p.locator('.x-answer, .h-gasto').count() > 0);
    await p.screenshot({ path: `${OUT}/pc-caixa-no-app.png` });
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    await p.locator('.l-chip', { hasText: 'Testar meu site' }).first().click(); await p.waitForTimeout(1500);
    console.log('sugestão leva para:', p.url().replace(BASE, ''));
    console.log('botão de voz no app (caixa vazia):', await p.locator('button[data-voz]').count());
  }
  await ctx.close();
}
console.log('ERROS:', erros.length); for (const e of [...new Set(erros)].slice(0, 20)) console.log('  ', e);
await b.close();
