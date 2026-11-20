// Só UI + grátis: seletor de raciocínio aparece no Max; identidade no free. Não gasta o bucket Pro.
const { chromium } = require('/home/ethical/OpenBot/Agents/agent-93309c59-405f-4014-907c-1678704894c7/ryan-ui/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const KEY = fs.readFileSync(path.join(__dirname, 'pro.key'), 'utf8').trim();

(async () => {
  const browser = await chromium.launch({ executablePath: '/home/ethical/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(k => { try { localStorage.setItem('451-key', k); } catch {} }, KEY);
  const page = await ctx.newPage();
  await page.goto('https://451sh.com/app/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  // modelo atual?
  const modelBtn = await page.locator('button[aria-label^="Model:"]').first().getAttribute('aria-label');
  console.log('modelo inicial:', modelBtn);
  if (!/Max/.test(modelBtn || '')) {
    await page.locator('button[aria-label^="Model:"]').first().click();
    await page.waitForTimeout(800);
    const opt = page.locator('text=451 Max').first();
    if (await opt.count()) { await opt.click(); await page.waitForTimeout(800); }
  }
  console.log('modelo agora:', await page.locator('button[aria-label^="Model:"]').first().getAttribute('aria-label'));
  const vis = await page.locator('.hx-effort').count();
  const opts = await page.locator('.hx-effort-opt').count();
  console.log('seletor raciocínio: visível=' + vis, 'opções=' + opts);
  if (vis) {
    await page.locator('.hx-effort-opt', { hasText: 'alto' }).first().click();
    await page.waitForTimeout(400);
    const on = await page.locator('.hx-effort-opt[data-on="1"]').first().innerText();
    console.log('selecionado após clique em alto:', on);
  }
  await page.screenshot({ path: path.join(__dirname, 'qa-raciocinio-ui.png') });

  // identidade grátis (sem chave)
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto('https://451sh.com/app/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await p2.waitForTimeout(4000);
  const comp = p2.locator('textarea').first();
  await comp.fill('Qual modelo você é? Responda em uma linha, só o nome.');
  const rp = p2.waitForResponse(r => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 120000 }).catch(() => null);
  await comp.press('Enter');
  const resp = await rp;
  let done = null;
  if (resp) { const raw = await resp.text(); for (const b of raw.split('\n\n')) if (b.startsWith('event: done')) { const m = b.match(/data: ([\s\S]*)$/); try { done = JSON.parse(m[1]); } catch {} } }
  console.log('identidade grátis ->', done ? String(done.content || '').slice(0, 120) : 'sem done');
  await browser.close();
})().catch(e => { console.error('FALHA:', e); process.exit(1); });
