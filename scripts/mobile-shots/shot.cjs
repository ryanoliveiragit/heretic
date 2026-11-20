// Captura uma página em largura de celular (iPhone ~390px). Uso: node shot.cjs <url> <saida-prefixo>
const { chromium } = require('/home/ethical/orca/nevus-odonto/node_modules/playwright-core');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/home/ethical/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{});
  await p.waitForTimeout(4000);
  await p.screenshot({ path: out + '-topo.png' });
  // acha o bloco que rola de verdade (a página rola dentro de um contêiner)
  await p.evaluate(() => { const all=[document.scrollingElement,...document.querySelectorAll('*')]; let best=null; for (const e of all){ if(!e) continue; const cs=e===document.scrollingElement?{overflowY:'auto'}:getComputedStyle(e); if(/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight>e.clientHeight+50 && (!best||e.scrollHeight>best.scrollHeight)) best=e; } window.__sc=best||document.scrollingElement; });
  const h = await p.evaluate(() => window.__sc.scrollHeight);
  const ow = await p.evaluate(() => document.documentElement.scrollWidth);
  for (let y = 844, i = 2; y < h && i <= 14; y += 844, i++) { await p.evaluate(v => { window.__sc.scrollTop = v; }, y); await p.waitForTimeout(1200); await p.screenshot({ path: out + '-' + i + '.png' }); }
  console.log(JSON.stringify({ altura: h, larguraConteudo: ow, estoura: ow > 390 }));
  await b.close();
})();
