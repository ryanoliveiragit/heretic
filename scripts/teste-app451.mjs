// Teste dos fluxos do /app novo (redesign 19/11) contra um servidor 451 local ou o endereço público.
// Uso: node teste-app451.mjs <base-url> <pasta-saida> [chave-pro]
import { createRequire } from 'node:module';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, OUT, PRO] = process.argv.slice(2);
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const erros = [];
const abrir = async (vp, chave, mobile = false) => {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  if (chave) await ctx.addInitScript((k) => { try { localStorage.setItem('451-key', k); } catch {} }, chave);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 200)); });
  p.on('response', (r) => { if (r.status() >= 400 && !/_vercel|cursor\.js/.test(r.url())) erros.push(`HTTP ${r.status()} ${r.url()}`); });
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(2500);
  return p;
};
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
const esperarResposta = async (p, max = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < max) { if (await p.locator('.h-gasto, .h-erro-resp').count()) return true; await p.waitForTimeout(1000); }
  return false;
};
const passo = async (nome, f) => { try { await f(); console.log('ok  ', nome); } catch (e) { console.log('FALHA', nome, String(e.message).slice(0, 200)); } };

// 1. Grátis, computador
let p = await abrir({ width: 1440, height: 900 });
await passo('inicio gratis', async () => { await shot(p, '01-inicio-gratis'); if (!(await p.locator('.h-uso').count())) throw new Error('sem linha de uso'); console.log('     ', await p.locator('.h-uso').innerText()); });
await passo('menu de modelos', async () => { await p.locator('[aria-haspopup="menu"]').first().click(); await p.waitForTimeout(600); await shot(p, '02-menu-modelos'); await p.keyboard.press('Escape'); });
await passo('mensagem gratis', async () => {
  await p.locator('textarea').first().fill('Responda só com a palavra: Paris. Qual a capital da França?');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1500); await shot(p, '03-escrevendo');
  if (!(await esperarResposta(p))) throw new Error('resposta não terminou');
  await p.waitForTimeout(800); await shot(p, '04-resposta-gratis');
  console.log('      gasto:', await p.locator('.h-gasto').first().innerText().catch(() => '-'));
  console.log('      historico:', await p.locator('.h-hist-item').count());
});
await passo('arena bloqueada no gratis', async () => { await p.getByRole('switch', { name: /Arena|Qualidade|Quality/i }).first().click(); await p.waitForTimeout(600); await shot(p, '05-upsell-arena'); await p.keyboard.press('Escape'); await p.waitForTimeout(300); });
await passo('configuracoes planos', async () => { await p.locator('.h-cfg-link').click(); await p.waitForTimeout(700); await shot(p, '06-cfg-planos'); await p.locator('.h-cfg-nav button', { hasText: 'Créditos' }).click(); await p.waitForTimeout(400); await shot(p, '07-cfg-creditos'); await p.locator('.h-cfg-nav button', { hasText: 'Sua chave' }).click(); await p.waitForTimeout(400); await shot(p, '08-cfg-chave'); await p.keyboard.press('Escape'); await p.waitForTimeout(300); });
await passo('assinar abre pagamento real', async () => { await p.locator('.h-cplano button').click(); await p.waitForTimeout(1500); await shot(p, '09-pagar'); await p.keyboard.press('Escape'); await p.waitForTimeout(300); });
await passo('entrar com chave errada', async () => { await p.locator('.h-entrar').first().click(); await p.waitForTimeout(400); await p.locator('.m-caixa input').fill('451-ERRADA-0000-0000'); await p.locator('.m-caixa button[type=submit]').click(); await p.waitForTimeout(1500); await shot(p, '10-entrar-erro'); console.log('     ', await p.locator('.m-caixa .h-erro').innerText()); await p.keyboard.press('Escape'); });
await passo('imagens', async () => { await p.locator('.a-nav a', { hasText: 'Imagens' }).click(); await p.waitForTimeout(500); await shot(p, '11-imagens'); });
await p.context().close();

// 2. Pro (chave de teste local)
if (PRO) {
  p = await abrir({ width: 1440, height: 900 }, PRO);
  await passo('inicio pro', async () => { await shot(p, '20-inicio-pro'); });
  await passo('agente + co-work', async () => {
    await p.getByRole('switch', { name: /Agente|Agent/i }).first().click(); await p.waitForTimeout(800);
    await p.locator('textarea').first().fill('testar meu site');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(500); await shot(p, '21-quebrando');
    await p.waitForTimeout(2500); await shot(p, '22-afinando');
    if (!(await esperarResposta(p, 120000))) throw new Error('resposta do agente não terminou');
    await p.waitForTimeout(1000); await shot(p, '23-resposta-agente');
    console.log('      pedido afinado:', await p.locator('.h-cromo-pedido').count());
    await p.waitForTimeout(12000); await shot(p, '24-cowork-dica');
    console.log('      dock:', await p.locator('.h-dock').count(), 'pilula:', await p.locator('.h-ilha').count());
  });
  await passo('arena pro', async () => {
    await p.getByRole('switch', { name: /Agente|Agent/i }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('switch', { name: /Arena|Qualidade|Quality/i }).first().click(); await p.waitForTimeout(300);
    await p.locator('textarea').first().fill('Em 3 linhas: o que é XSS refletido?');
    await p.keyboard.press('Enter');
    if (!(await esperarResposta(p, 180000))) throw new Error('arena não terminou');
    await p.waitForTimeout(8000); await shot(p, '25-arena');
    console.log('      juiz:', await p.locator('.h-juiz').innerText().catch(() => 'sem bloco do juiz'));
  });
  await passo('configuracoes agente e api', async () => { await p.locator('.h-cfg-link').click(); await p.waitForTimeout(600); await p.locator('.h-cfg-nav button').nth(1).click(); await p.waitForTimeout(500); await shot(p, '26-cfg-agente'); await p.locator('.h-cfg-nav button', { hasText: 'API' }).click(); await p.waitForTimeout(400); await shot(p, '27-cfg-api'); await p.locator('.h-cfg-nav button', { hasText: 'Sua chave' }).click(); await p.waitForTimeout(400); await shot(p, '28-cfg-chave-pro'); });
  await p.context().close();
}

// 3. Celular
p = await abrir({ width: 390, height: 844 }, null, true);
await passo('celular inicio', async () => { await shot(p, '30-cel-inicio'); const w = await p.evaluate(() => document.documentElement.scrollWidth); console.log('      largura conteudo:', w); });
await passo('celular conversa', async () => {
  await p.locator('textarea').first().fill('Revise esta função de login em PHP');
  await p.keyboard.press('Enter');
  if (!(await esperarResposta(p))) throw new Error('resposta não terminou');
  await p.waitForTimeout(800); await shot(p, '31-cel-resposta');
  const w = await p.evaluate(() => document.documentElement.scrollWidth); console.log('      largura conteudo:', w);
  await p.getByRole('button', { name: 'Abrir o menu' }).click(); await p.waitForTimeout(600); await shot(p, '32-cel-menu');
  await p.locator('.h-menu-fundo').click({ position: { x: 370, y: 400 } }); await p.waitForTimeout(400);
  await p.locator('.h-pill-btn, .h-suporte-topo').first().count();
  await p.getByRole('button', { name: 'Abrir o menu' }).click(); await p.waitForTimeout(400); await p.locator('.h-cfg-link').click(); await p.waitForTimeout(700); await shot(p, '33-cel-config');
});
await p.context().close();

console.log('ERROS:', erros.length); for (const e of [...new Set(erros)].slice(0, 25)) console.log('  ', e);
await b.close();
