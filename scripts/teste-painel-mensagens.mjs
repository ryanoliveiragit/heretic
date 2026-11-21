// Uso: node scripts/teste-painel-mensagens.mjs <pasta do site do painel> <json do teste-painel> <pasta dos prints>
// Abre o painel local em 390 px com o JSON do teste (sem rede) e fotografa "Últimas mensagens".
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [SITE, MOCK, OUT] = process.argv.slice(2);
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  const p = join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html')));
  if (!p.startsWith(SITE) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TIPOS[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await PW.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
await page.route('https://451sh.com/api/admin/painel', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(MOCK, 'utf8') }));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.addInitScript(() => localStorage.setItem('painel451-admin', 'CHAVE-DE-TESTE'));
await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await page.waitForSelector('.u-parts');
const secao = page.locator('details.u-pay', { hasText: 'Últimas mensagens' });
await secao.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 330));
await page.screenshot({ path: join(OUT, 'painel-mensagens-1.png') });
await page.evaluate(() => window.scrollBy(0, 700));
await page.screenshot({ path: join(OUT, 'painel-mensagens-2.png') });
const linhas = await secao.locator('.u-row').count();
const larguraOk = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
console.log(`mensagens na tela: ${linhas} | sem estourar 390 px: ${larguraOk}`);
console.log('texto:', (await secao.textContent()).replace(/\s+/g, ' ').trim().slice(0, 700));
console.log('erros:', erros.length ? erros : 'nenhum');
await b.close(); srv.close();
