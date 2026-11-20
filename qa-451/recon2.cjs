// Recon: diálogo Entrar + estado Pro via localStorage.
const { chromium } = require('/home/ethical/OpenBot/Agents/agent-93309c59-405f-4014-907c-1678704894c7/ryan-ui/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const KEY = fs.readFileSync(path.join(__dirname, 'pro.key'), 'utf8').trim();

(async () => {
  const b = await chromium.launch({ executablePath: '/home/ethical/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });

  // 1) diálogo Entrar
  const ctx1 = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p1 = await ctx1.newPage();
  await p1.goto('https://451sh.com/app/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await p1.waitForTimeout(3000);
  const btn = p1.locator('button:has-text("Entrar")').first();
  if (await btn.count()) { await btn.click(); await p1.waitForTimeout(1500); }
  console.log('dialogo:', (await p1.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700));
  console.log('inputs do dialogo:', await p1.evaluate(() => [...document.querySelectorAll('input')].map(e => e.type + ' ph="' + (e.placeholder || '') + '"').join(' ; ')));
  await p1.screenshot({ path: path.join(__dirname, 'recon-entrar.png') });
  await ctx1.close();

  // 2) Pro via localStorage 451-key
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx2.addInitScript(k => { try { localStorage.setItem('451-key', k); } catch {} }, KEY);
  const p2 = await ctx2.newPage();
  await p2.goto('https://451sh.com/app/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await p2.waitForTimeout(4000);
  console.log('PRO text:', (await p2.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700));
  console.log('PRO buttons:', await p2.evaluate(() => [...document.querySelectorAll('button')].slice(0, 40).map(e => (e.getAttribute('aria-label') || e.innerText || '?').replace(/\s+/g, ' ').slice(0, 40)).join(' ; ')));
  await p2.screenshot({ path: path.join(__dirname, 'recon-pro2.png') });
  await b.close();
})().catch(e => { console.error('FALHA:', e.message); process.exit(1); });
