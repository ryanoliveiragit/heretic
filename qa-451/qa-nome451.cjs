// Verificação pós-deploy: identidade 451 em todos os caminhos + esforço (baixo/alto) + UI.
const { chromium } = require('/home/ethical/OpenBot/Agents/agent-93309c59-405f-4014-907c-1678704894c7/ryan-ui/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const KEY = fs.readFileSync(path.join(__dirname, 'pro.key'), 'utf8').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const out = [];

async function v1(name, body) {
  await sleep(9500);
  const t0 = Date.now();
  const r = await fetch('https://451sh.com/api/v1/chat/completions', { method: 'POST', headers: H, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  const msg = d.choices?.[0]?.message || {};
  const rec = { name, status: r.status, ms: Date.now() - t0, content: String(msg.content || ''), reasoningLen: String(msg.reasoning_content || '').length, out: d.usage?.completion_tokens ?? null };
  out.push(rec);
  console.log(name, '->', rec.status, rec.ms + 'ms', 'out=' + rec.out, 'reason=' + rec.reasoningLen, JSON.stringify(rec.content.slice(0, 140)));
  return rec;
}

async function chatSSE(label, { key = null, effort } = {}) {
  await sleep(9500);
  const headers = { 'Content-Type': 'application/json', ...(key ? { 'x-451-key': key } : {}) };
  const body = { mode: 'chat', model: key ? 'claude-sonnet-5-5' : 'nousresearch/hermes-4-405b', messages: [{ role: 'user', content: 'Qual modelo você é? Responda em uma linha, só o nome.' }], params: { temperature: 0.6, top_p: 0.9, max_tokens: 4096 }, ...(effort ? { effort } : {}) };
  const t0 = Date.now();
  const r = await fetch('https://451sh.com/api/chat', { method: 'POST', headers, body: JSON.stringify(body) });
  const raw = await r.text();
  let done = null, erro = null;
  for (const block of raw.split('\n\n')) {
    if (block.startsWith('event: done')) { const m = block.match(/data: ([\s\S]*)$/); try { done = JSON.parse(m[1]); } catch {} }
    if (block.startsWith('event: error')) { const m = block.match(/data: ([\s\S]*)$/); try { erro = JSON.parse(m[1]); } catch {} }
  }
  const rec = { name: label, status: r.status, ms: Date.now() - t0, content: done ? String(done.content || '') : (erro ? 'ERR ' + (erro.message || '') : ''), len: done ? String(done.content || '').length : 0 };
  out.push(rec);
  console.log(label, '->', rec.status, rec.ms + 'ms', JSON.stringify(rec.content.slice(0, 140)));
  return rec;
}

(async () => {
  // 1) identidade no /api/chat: grátis (Titan) e Pro (Max)
  await chatSSE('chat-gratis-identidade');
  await chatSSE('chat-pro-identidade', { key: KEY });
  // 2) identidade no /v1
  await v1('v1-identidade', { model: '451-max-uncensored', messages: [{ role: 'user', content: 'Qual modelo você é? Responda em uma linha, só o nome.' }] });
  // 3) esforço: mesmo problema, baixo vs alto (comparar raciocínio/tokens)
  const problema = 'Calcule o valor final, mostrando cada passo: comece com 100, some 25, multiplique por 2, subtraia 30, divida por 5, eleve o resultado ao quadrado e some 10. Diga o número final na última linha, sozinho.';
  const rLow = await v1('v1-esforco-baixo', { model: '451-max-uncensored', effort: 'baixo', messages: [{ role: 'user', content: problema }] });
  const rHigh = await v1('v1-esforco-alto', { model: '451-max-uncensored', effort: 'alto', messages: [{ role: 'user', content: problema }] });
  // 4) reasoning_effort (padrão OpenAI) também é aceito?
  await v1('v1-reasoning_effort-high', { model: '451-max-uncensored', reasoning_effort: 'high', messages: [{ role: 'user', content: problema }] });

  // 5) UI: seletor de raciocínio aparece no Max
  const browser = await chromium.launch({ executablePath: '/home/ethical/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(k => { try { localStorage.setItem('451-key', k); } catch {} }, KEY);
  const page = await ctx.newPage();
  await page.goto('https://451sh.com/app/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  // troca p/ Max
  await page.locator('button[aria-label^="Model:"]').first().click();
  await page.waitForTimeout(800);
  const opt = page.locator('text=451 Max').first();
  if (await opt.count()) await opt.click();
  await page.waitForTimeout(800);
  const effortVisible = await page.locator('.hx-effort').count();
  const effortOpts = await page.locator('.hx-effort-opt').count();
  // clica em alto e confere o estado
  let altoOn = false;
  if (effortVisible) { await page.locator('.hx-effort-opt[data-on="1"]').first().click().catch(() => {}); await page.waitForTimeout(300); altoOn = await page.locator('.hx-effort-opt[data-on="1"]').first().getAttribute('data-on'); }
  out.push({ name: 'ui-raciocinio', visible: effortVisible, options: effortOpts, altoState: altoOn });
  console.log('ui-raciocinio: visível=' + effortVisible, 'opções=' + effortOpts, 'alto on=' + altoOn);
  await page.screenshot({ path: path.join(__dirname, 'qa-raciocinio-ui.png') });
  await browser.close();

  fs.writeFileSync(path.join(__dirname, 'qa-nome451-results.json'), JSON.stringify(out, null, 1));
  console.log('FIM verificação.');
})().catch(e => { console.error('FALHA:', e); process.exit(1); });
