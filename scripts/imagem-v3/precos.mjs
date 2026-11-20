import { createRequire } from 'node:module';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, O] = process.argv.slice(2);
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
await p.locator('#precos').scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
await p.locator('#precos').screenshot({ path: `${O}/p1-landing-precos.png` });
const r = { landing: await p.locator('#precos').innerText() };
await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
await p.locator('.h-menu-btn').click(); await p.waitForTimeout(400);
await p.locator('.h-cfg-link').click(); await p.waitForTimeout(800);
await p.getByRole('tab', { name: 'Planos' }).click().catch(() => {}); await p.waitForTimeout(600);
for (const per of ['mensal', 'trimestral', 'anual']) { await p.locator('.p-abas.peq a', { hasText: new RegExp(per, 'i') }).click().catch(() => {}); await p.waitForTimeout(300); r[per] = await p.locator('.p-plano[data-dest] .p-preco').innerText().catch(() => null); }
await p.screenshot({ path: `${O}/p2-app-planos.png`, fullPage: false });
r.imagensLinha = await p.getByText('Imagens geradas').count();
r.erros = erros; console.log(JSON.stringify(r).slice(0, 900)); await b.close();
