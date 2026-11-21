// Uso: node scripts/teste-gratis-tela.mjs <url do app> <pasta dos prints> <imagem.png>
// Visitante comum (sem chave) no 451 Free: 1 pergunta com busca (fontes na tela) e 1 foto (lida pelo Inkling).
import { createRequire } from 'node:module';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [URL, OUT, IMG] = process.argv.slice(2);
const b = await PW.chromium.launch();
async function conversa(nome, acao) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('451-model', 'local:gptoss20b'); } catch { /* */ } });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  const caixa = page.locator('textarea').first(); await caixa.waitFor({ timeout: 30000 });
  const resp = page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 120000 });
  await acao(page, caixa);
  const r = await resp;
  const corpo = Buffer.from(await r.body()).toString('utf8');
  const ev = corpo.split('\n\n').map((x) => { const e = /event: (\w+)/.exec(x)?.[1]; let d = null; try { d = JSON.parse(/data: (.*)/s.exec(x)?.[1]); } catch { /* */ } return { e, d }; });
  const fim = ev.find((x) => x.e === 'done')?.d?.content || '';
  const erro = ev.find((x) => x.e === 'error')?.d?.message || (r.status() !== 200 ? corpo.slice(0, 160) : null);
  const fontes = ev.find((x) => x.e === 'warning' && x.d?.type === 'sources')?.d?.sources?.length || 0;
  await page.waitForTimeout(3000);
  const alvo = page.locator('.x-answer').last();
  const box = await alvo.boundingBox().catch(() => null);
  if (box) await page.screenshot({ path: `${OUT}/${nome}.png`, clip: { x: 0, y: Math.max(0, box.y - 14), width: 390, height: Math.min(box.height + 22, 1400 - box.y) } });
  console.log(`- ${nome}: HTTP ${r.status()} | fontes ${fontes} | ${erro ? 'ERRO ' + erro : 'resposta: ' + JSON.stringify(fim.replace(/\s+/g, ' ').slice(0, 200))} | erros de página: ${erros.length}`);
  await ctx.close();
}
await conversa('busca', async (page, caixa) => { await caixa.fill('Quanto está o dólar hoje? Responda em duas frases.'); await caixa.press('Enter'); });
await conversa('foto', async (page, caixa) => {
  await page.locator('input[type="file"]').first().setInputFiles(IMG);
  await page.waitForTimeout(1500);
  await caixa.fill('Quanto deu essa nota?'); await caixa.press('Enter');
});
await b.close();
