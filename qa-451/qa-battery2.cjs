// Continuação da bateria: V7-V11, retry dos 504 (V3/V5), mobile 390 e prompt MUITO LONGO (~1100 palavras).
const { chromium } = require('/home/ethical/OpenBot/Agents/agent-93309c59-405f-4014-907c-1678704894c7/ryan-ui/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const KEY = fs.readFileSync(path.join(__dirname, 'pro.key'), 'utf8').trim();
const OUT = path.join(__dirname, 'qa-results2.json');
const results = [];
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasDSML = s => /DSML/i.test(s || '');

const PROMPTS = {
  horas: 'Que horas são em São Paulo agora? Responda curto.',
  identidade: 'Qual modelo você é? Responda em uma linha, só o nome.',
  haiku: 'Escreva um haiku sobre código.',
  titulo: { model: '451-max-uncensored', messages: [{ role: 'user', content: 'Escreva um haiku sobre redes.' }] },
};
const V1_MEDIO = 'Descreva, em português, um plano de pentest autorizado de uma API REST, em 5 etapas numeradas. Em cada etapa: a ferramenta, o comando de exemplo e o que procurar. No máximo 200 palavras, sem introdução nem conclusão.';
const V1_LONGO = require('fs').readFileSync(path.join(__dirname, 'longo.txt'), 'utf8').trim();

// ~1100 palavras: especificação com 16 seções.
const X = [
  'Escreva, em português, a especificação completa do módulo de cobrança de um SaaS de assinaturas, para uma equipe de engenharia implementar sem precisar perguntar nada. Siga exatamente esta estrutura, com as seções numeradas:',
  '1. Objetivo do módulo: o que ele entrega para o assinante e para a empresa, em dois parágrafos curtos.',
  '2. Personas: assinante, administrador da conta e financeiro, com o que cada um faz dentro do módulo.',
  '3. Planos: gratuito, Pro mensal, Pro trimestral e Pro anual, com o que cada um inclui e as regras de troca (upgrade, downgrade, prorrogação).',
  '4. Métodos de pagamento: Pix, cartão e cripto, com o fluxo de cada um, pagamento pendente, recusa, reembolso e o prazo de cada estado.',
  '5. Estados do ciclo de vida: trial, ativo, pendente, suspenso, cancelado, inadimplente, com as transições entre eles e quem dispara cada uma.',
  '6. Cobrança recorrente: quando a fatura é criada, número de tentativas, intervalo entre tentativas, régua de cobrança e o que acontece quando esgota.',
  '7. Facturação e nota: quando é emitida, o que precisa conter e o que acontece em estorno.',
  '8. Chave de acesso: como o plano é liberado para o assinante, formato da chave, validade, renovação automática e expiração.',
  '9. API: no máximo 10 endpoints, com rota, verbo, corpo, resposta e erro, cobrindo criação de pedido, status, webhook e assinaturas.',
  '10. Webhooks: os eventos emitidos, o que cada um carrega, confirmação de recebimento e entrega duplicada.',
  '11. Segurança: o que é secreto, como o segredo do webhook é conferido, assinatura inválida e dados sensíveis por tela.',
  '12. Métricas: as 5 métricas que o financeiro acompanha e como cada uma é calculada.',
  '13. Conciliação: como o sistema casa pagamentos recebidos com assinaturas ativas, o que acontece quando não casa e o relatório diário.',
  '14. Reembolso: quem pode solicitar, o prazo, o que volta (créditos, plano, dias) e o registro contábil.',
  '15. Migração: o que acontece quando o assinante troca de plano no meio do período, a proporção do valor restante e a nota de crédito.',
  '16. Falhas: o que acontece quando o provedor de pagamento cai, quando o webhook chega atrasado e quando o Redis fica indisponível, com o comportamento esperado em cada caso.',
  'Regras gerais: escreva como quem vai cobrar a equipe se errar; não invente valores monetários, use variáveis; cada seção no mínimo 50 palavras; não repita conteúdo entre seções; termine com uma tabela resumo das transições de estado.'
].join('\n');

async function fetchJson(url, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(url, opts);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, ms: Date.now() - t0, body };
}
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
async function v1(id, name, body) {
  await sleep(9500);
  let r = await fetchJson('https://451sh.com/api/v1/chat/completions', { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (r.status === 429) { await sleep(10000); r = await fetchJson('https://451sh.com/api/v1/chat/completions', { method: 'POST', headers: H, body: JSON.stringify(body) }); }
  const msg = (r.body && r.body.choices && r.body.choices[0] && r.body.choices[0].message) || {};
  const out = {
    part: 'C-api2', test: id + ': ' + name, status: r.status, ms: r.ms,
    finish: (r.body && r.body.choices && r.body.choices[0] && r.body.choices[0].finish_reason) || null,
    content: msg.content || '', reasoning: msg.reasoning_content || '',
    toolCalls: (msg.tool_calls || []).map(t => t.function && (t.function.name + ' ' + String(t.function.arguments).slice(0, 80))),
    model: r.body ? r.body.model : null,
    err: (r.body && r.body.error) ? (r.body.error.message || '') : null,
  };
  out.dsml = hasDSML(out.content + out.reasoning);
  out.promptWords = (body.messages || []).map(m => String(m.content || '').split(/\s+/).length).reduce((a, b) => a + b, 0);
  results.push(out);
  log(id, name, '->', out.status, out.ms + 'ms', 'finish=' + out.finish, 'len=' + out.content.length, 'tools=' + (out.toolCalls || []).join(','), 'dsml=' + out.dsml, out.err ? ('ERR:' + out.err) : '');
  return out;
}

(async () => {
  const TOOL = { type: 'function', function: { name: 'get_current_time', description: 'Devolve a hora atual em São Paulo (BRT).', parameters: { type: 'object', properties: {} } } };

  // V6 já rodou na bateria 1: tool_calls ok (2s). Agora a continuação:
  await v1('V7', 'ferramenta: resultado -> resposta', {
    model: '451-max-uncensored', tools: [TOOL],
    messages: [
      { role: 'user', content: 'Que horas são em São Paulo agora? Use a ferramenta get_current_time.' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_qa1', type: 'function', function: { name: 'get_current_time', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_qa1', name: 'get_current_time', content: '2026-11-19 23:50 BRT' },
    ],
  });
  await v1('V8', 'identidade', { model: '451-max-uncensored', messages: [{ role: 'user', content: 'Qual modelo você é e pela qual API você responde? Responda em duas linhas.' }] });
  await v1('V9', 'alias 451-titan (Paris)', { model: '451-titan', messages: [{ role: 'user', content: 'Qual é a capital da França? Responda com uma palavra.' }] });
  // retry dos 504: 2 tentativas cada
  await v1('V3-r1', 'RETRY 504: curto haiku (tentativa 1)', PROMPTS.titulo);
  await v1('V3-r2', 'RETRY 504: curto haiku (tentativa 2)', PROMPTS.titulo);
  await v1('V5-r1', 'RETRY 504: longo 146 palavras (tentativa 1)', { model: '451-max-uncensored', messages: [{ role: 'user', content: V1_LONGO }] });
  await v1('V5-r2', 'RETRY 504: longo 146 palavras (tentativa 2)', { model: '451-max-uncensored', messages: [{ role: 'user', content: V1_LONGO }] });
  // streaming
  {
    await sleep(9500);
    const t0 = Date.now();
    const r = await fetch('https://451sh.com/api/v1/chat/completions', { method: 'POST', headers: H, body: JSON.stringify({ model: '451-max-uncensored', stream: true, messages: [{ role: 'user', content: PROMPTS.titulo.messages[0].content }] }) });
    const text = await r.text();
    const chunks = text.split('data: ').filter(x => x.startsWith('{')).length;
    results.push({ part: 'C-api2', test: 'V10: streaming SSE', status: r.status, ms: Date.now() - t0, chunks, hasDone: text.includes('[DONE]'), dsml: hasDSML(text) });
    log('V10 streaming ->', r.status, chunks + ' chunks', 'done=' + text.includes('[DONE]'), 'dsml=' + hasDSML(text));
  }
  // afinador
  {
    const r = await fetchJson('https://451sh.com/api/v1/agent/refine', { method: 'POST', headers: H, body: JSON.stringify({ text: 'testar meu site' }) });
    results.push({ part: 'C-api2', test: 'V11: afinador', status: r.status, changed: r.body ? r.body.changed === true : null, refinedLen: r.body ? String(r.body.refined || '').length : 0, sample: r.body ? String(r.body.refined || '').slice(0, 200) : '' });
    log('V11 afinador ->', r.status, 'changed=' + (r.body && r.body.changed));
  }

  // X1: UI Max com ~1100 palavras
  const browser = await chromium.launch({ executablePath: '/home/ethical/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(k => { try { localStorage.setItem('451-key', k); } catch {} }, KEY);
    const page = await ctx.newPage();
    await page.goto('https://451sh.com/app/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const composer = page.locator('textarea').first();
    await page.locator('button[aria-label^="Model:"]').first().click();
    await page.waitForTimeout(800);
    const menuText = await page.evaluate(() => { const d = document.querySelector('[role="menu"],[role="listbox"]'); return d ? d.innerText.replace(/\n+/g, '|') : 'sem-menu:' + document.body.innerText.slice(-400); });
    log('menu de modelos:', String(menuText).slice(0, 300));
    const opt = page.locator('text=451 Max').first();
    if (await opt.count()) await opt.click();
    await page.waitForTimeout(800);
    const modelBtn = await page.locator('button[aria-label^="Model:"]').first().getAttribute('aria-label');
    log('selecionado:', modelBtn);
    await sleep(9500);
    await composer.fill(X);
    const t0 = Date.now();
    const rp = page.waitForResponse(r => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 300000 }).catch(() => null);
    await composer.press('Enter');
    const resp = await rp;
    let done = null;
    if (resp) {
      const raw = await resp.text();
      for (const block of raw.split('\n\n')) {
        if (block.startsWith('event: done')) { const dm = block.match(/data: ([\s\S]*)$/); try { done = JSON.parse(dm[1]); } catch {} }
      }
    }
    const content = done ? String(done.content || '') : '';
    results.push({ part: 'X-ultra', test: 'X1: UI Max ' + X.split(/\s+/).length + ' palavras', ms: Date.now() - t0, modelBtn, status: resp ? resp.status() : null, contentLen: content.length, dsmlInContent: hasDSML(content), sample: content.slice(0, 150) });
    log('X1 UI 1100 palavras ->', done ? (Date.now() - t0) + 'ms len=' + content.length : 'sem done');
    await page.screenshot({ path: path.join(__dirname, 'qa-X1-ultra-longo.png') });
    await ctx.close();
  }
  // X2: /v1 Max com ~1100 palavras (non-stream) — testa o teto de 25 s também com entrada grande
  await v1('X2', 'MUITO LONGO ' + X.split(/\s+/).length + ' palavras (non-stream)', { model: '451-max-uncensored', messages: [{ role: 'user', content: X }] });

  // D: mobile 390
  {
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    const mp = await mctx.newPage();
    const mErr = [];
    mp.on('pageerror', e => mErr.push(String(e).slice(0, 160)));
    await mp.goto('https://451sh.com/app/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await mp.waitForTimeout(4000);
    const overflow = await mp.evaluate(() => {
      let worst = 0;
      for (const e of document.querySelectorAll('*')) {
        if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'hidden') worst = Math.max(worst, e.scrollWidth - e.clientWidth);
      }
      return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, worst };
    });
    results.push({ part: 'D-mobile', test: 'smoke 390px estouro', ok: overflow.doc <= 1 && overflow.worst <= 1, overflow, pageErrors: mErr });
    log('D mobile smoke: doc=' + overflow.doc, 'worst=' + overflow.worst, 'pageErr=' + mErr.length);
    const composer = mp.locator('textarea').first();
    if (await composer.count()) {
      await sleep(9500);
      await composer.fill('olá. Responda com uma frase curta.');
      const rp = mp.waitForResponse(r => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 180000 }).catch(() => null);
      await composer.press('Enter');
      const resp = await rp;
      let done = null;
      if (resp) { const raw = await resp.text(); for (const block of raw.split('\n\n')) if (block.startsWith('event: done')) { const dm = block.match(/data: ([\s\S]*)$/); try { done = JSON.parse(dm[1]); } catch {} } }
      results.push({ part: 'D-mobile', test: 'mensagem no mobile', ms: null, status: resp ? resp.status() : null, contentLen: done ? String(done.content || '').length : 0, dsmlInContent: hasDSML(done ? done.content : ''), sample: done ? String(done.content).slice(0, 120) : '' });
      log('D mobile msg ->', done ? done.content.slice(0, 80) : 'sem done');
    }
    await mp.screenshot({ path: path.join(__dirname, 'qa-D-mobile.png') });
    await mctx.close();
  }

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  log('FIM2. resultados em', OUT);
})().catch(e => { console.error('FALHA GERAL2:', e); process.exit(1); });
