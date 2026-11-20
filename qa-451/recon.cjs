// Reconhecimento da tela /app: sem enviar mensagem (não gasta cota).
const { chromium } = require('/home/ethical/OpenBot/Agents/agent-93309c59-405f-4014-907c-1678704894c7/ryan-ui/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const KEY = fs.readFileSync(path.join(__dirname, 'pro.key'), 'utf8').trim();

(async () => {
  const b = await chromium.launch({ executablePath: '/home/ethical/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 200)));

  await p.goto('https://451sh.com/app/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(5000);
  console.log('== SEM CHAVE (gratis) ==');
  console.log('title:', await p.title());
  console.log('text:', (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 900));
  console.log('inputs:', await p.evaluate(() => [...document.querySelectorAll('input,textarea,[contenteditable="true"]')].map(e => e.tagName + (e.placeholder ? ' ph="' + e.placeholder + '"' : '') + (e.className ? ' .' + String(e.className).slice(0, 40) : '')).join(' ; ')));
  console.log('buttons:', await p.evaluate(() => [...document.querySelectorAll('button')].slice(0, 40).map(e => (e.getAttribute('aria-label') || e.innerText || e.className || '?').replace(/\s+/g, ' ').slice(0, 40)).join(' ; ')));
  await p.screenshot({ path: path.join(__dirname, 'recon-gratis.png'), fullPage: false });

  await p.goto('https://451sh.com/app/?key=' + KEY, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(5000);
  console.log('== COM CHAVE PRO ==');
  console.log('text:', (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 900));
  console.log('buttons:', await p.evaluate(() => [...document.querySelectorAll('button')].slice(0, 40).map(e => (e.getAttribute('aria-label') || e.innerText || e.className || '?').replace(/\s+/g, ' ').slice(0, 40)).join(' ; ')));
  await p.screenshot({ path: path.join(__dirname, 'recon-pro.png'), fullPage: false });
  console.log('errors:', JSON.stringify(errors, null, 1));
  await b.close();
})().catch(e => { console.error('FALHA:', e.message); process.exit(1); });
