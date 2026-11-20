// Bateria de QA — tela do app (451sh.com/app) + API /v1.
// Prompts: curtos, médios, longos e muito longos. Sem mock: produção de verdade.
const { chromium } = require('/home/ethical/OpenBot/Agents/agent-93309c59-405f-4014-907c-1678704894c7/ryan-ui/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const KEY = fs.readFileSync(path.join(__dirname, 'pro.key'), 'utf8').trim();
const OUT = path.join(__dirname, 'qa-results.json');
const results = [];
const log = (...a) => { console.log(...a); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasDSML = s => /DSML/i.test(s || '');

const PROMPTS = {
  curto: 'olá. Responda com uma frase curta.',
  horas: 'Que horas são em São Paulo agora? Responda curto.',
  identidade: 'Qual modelo você é? Responda em uma linha, só o nome.',
  codigo: 'Escreva uma função em Python chamada debounce que atrasa a execução de outra função em 200 ms, com docstring e um exemplo de uso. Só o código, sem explicação.',
  medio: 'Escreva um e-mail profissional em português para o cliente: informe que a manutenção do servidor será sábado das 14h às 18h, que o site ficará offline nesse período, que os backups foram feitos antes, e peça para ele testar os links internos depois da manutenção. Tom cordial e objetivo, no máximo 120 palavras, com linha de assunto.',
  longo: [
    'Vou testar a segurança de um site próprio, com autorização, em produção. Monte um plano de teste de intrusão completo, em 6 seções numeradas:',
    '1. Reconhecimento (passivo e ativo).',
    '2. Enumeração de portas e serviços.',
    '3. Teste de aplicação web.',
    '4. Autenticação e sessões.',
    '5. Injeção, XSS e upload de arquivo.',
    '6. Relatório final.',
    'Em cada seção, entregue: as 3 a 5 ferramentas recomendadas; um comando de exemplo por ferramenta, em linha única; e o que procurar no resultado de cada comando. Use markdown com títulos e listas, sem introdução e sem conclusão. Priorize o que dá mais risco primeiro. Cada teste precisa dizer o risco de quebrar a produção (baixo, médio, alto) e, se for médio ou alto, o passo de volta para desfazer. Termine com uma checklist de 10 itens que nunca podem ficar de fora de um teste autorizado, em ordem de execução.'
  ].join('\n'),
  muitoLongo: [
    'Escreva, em português, a especificação completa do módulo de cobrança de um SaaS de assinaturas, para uma equipe de engenharia implementar sem precisar perguntar nada. Siga exatamente esta estrutura, com as 12 seções numeradas:',
    '1. Objetivo do módulo: o que ele entrega para o assinante e para a empresa, em três parágrafos curtos.',
    '2. Personas: assinante, administrador da conta e financeiro, com o que cada um faz dentro do módulo.',
    '3. Planos: gratuito, Pro mensal, Pro trimestral e Pro anual, com o que cada um inclui e as regras de troca entre eles (upgrade, downgrade, prorrogação do período).',
    '4. Métodos de pagamento: Pix, cartão e cripto, com o fluxo de cada um, o que acontece em pagamento pendente, em recusa e em reembolso, e o prazo de cada estado.',
    '5. Estados do ciclo de vida: trial, ativo, pendente, suspenso, cancelado, inadimplente, com a transição que leva de um para o outro e quem pode disparar cada transição.',
    '6. Regras de cobrança recorrente: quando a fatura é criada, o número de tentativas, o intervalo entre tentativas, a régua de cobrança e o que acontece quando ela esgota.',
    '7. Facturação e nota: quando a nota é emitida, o que ela precisa conter e o que acontece em estorno.',
    '8. Chave de acesso: como o sistema libera os recursos do plano para o assinante, o formato da chave, a validade, a renovação automática e o que acontece quando a chave expira sem renovação.',
    '9. API: liste os endpoints do módulo (rotas, verbo, corpo, resposta e erro), no máximo 10 endpoints, cobrindo criação de pedido, consulta de status, webhook de pagamento e listagem de assinaturas.',
    '10. Webhooks: os eventos que o sistema emite, o que cada um carrega, como o receptor confirma o recebimento e como o sistema lida com entrega duplicada.',
    '11. Segurança: o que é secreto, como o segredo do webhook é conferido, o que acontece com assinatura inválida e quais dados sensíveis aparecem em cada tela.',
    '12. Métricas: as 5 métricas que o financeiro acompanha desse módulo e como cada uma é calculada.',
    'Regras gerais: escreva como quem vai cobrar a equipe se errar; não invente valores monetários, use variáveis (ex.: PRECO_PRO_MENSAL); cada seção deve ter no mínimo 120 palavras; não repita conteúdo entre seções; termine com uma tabela resumo das transições de estado.'
  ].join('\n'),
};
const V1_MEDIO = 'Descreva, em português, um plano de pentest autorizado de uma API REST, em 5 etapas numeradas. Em cada etapa: a ferramenta, o comando de exemplo e o que procurar. No máximo 200 palavras, sem introdução nem conclusão.';
const V1_LONGO = PROMPTS.longo;

async function fetchJson(url, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(url, opts);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, ms: Date.now() - t0, body };
}

// ── UI ─────────────────────────────────────────────────────────────
async function uiPart(browser, { key, label, shots }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (key) await ctx.addInitScript(k => { try { localStorage.setItem('451-key', k); } catch {} }, key);
  const page = await ctx.newPage();
  const consoleErr = [], badRes = [];
  page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => consoleErr.push('PAGEERROR: ' + String(e).slice(0, 160)));
  page.on('response', r => { if (r.status() >= 400) badRes.push(r.status() + ' ' + r.url().replace('https://451sh.com', '')); });

  await page.goto('https://451sh.com/app/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const composer = page.locator('textarea');
  const smoke = { ok: (await composer.count()) > 0, consoleErr: consoleErr.length, badRes: badRes.length };
  results.push({ part: label, test: 'smoke: tela carrega e composer existe', ...smoke });

  const send = async (prompt, { model, agente } = {}) => {
    if (model) {
      await page.locator('button[aria-label^="Model:"]').first().click();
      await page.waitForTimeout(600);
      const opt = page.locator('text=' + model).first();
      if (await opt.count()) await opt.click();
      await page.waitForTimeout(600);
    }
    if (agente) {
      const a = page.locator('button:has-text("Agente")').first();
      if (await a.count()) { await a.click(); await page.waitForTimeout(500); }
    }
    await composer.fill(prompt);
    const t0 = Date.now();
    const respPromise = page.waitForResponse(r => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 240000 });
    await composer.press('Enter');
    let resp = await respPromise.catch(() => null);
    if (resp && resp.status() === 429) { // freio de 8 s: espera e tenta 1x
      await sleep(10000);
      await composer.press('Enter').catch(() => {});
      resp = await page.waitForResponse(r => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 240000 }).catch(() => resp);
    }
    let done = null, enhanced = null, ssErr = null;
    if (resp) {
      const raw = await resp.text();
      const events = raw.split('\n\n').filter(b => b.trim());
      for (const block of events) {
        const ev = block.match(/^event: (\w+)/m);
        const dm = block.match(/data: ([\s\S]*)$/);
        if (!ev || !dm) continue;
        let d; try { d = JSON.parse(dm[1]); } catch { continue; }
        if (ev[1] === 'done') done = d;
        if (ev[1] === 'enhanced') enhanced = d;
        if (ev[1] === 'error') ssErr = d;
      }
    }
    await page.waitForTimeout(1500);
    const screenText = await page.evaluate(() => document.body.innerText);
    return {
      ms: Date.now() - t0,
      status: resp ? resp.status() : null,
      contentLen: done ? String(done.content || '').length : 0,
      content: done ? String(done.content || '') : (ssErr ? 'ERR: ' + (ssErr.message || '') : null),
      enhanced: enhanced ? { len: String(enhanced.text || '').length, changed: enhanced.text !== enhanced.original } : null,
      dsmlOnScreen: hasDSML(screenText),
      dsmlInContent: hasDSML(done ? done.content : ''),
    };
  };

  const run = async (id, prompt, name, opts) => {
    await sleep(9500); // freio de 8 s por chave + margem
    const r = await send(prompt, opts);
    results.push({ part: label, test: id + ': ' + name, promptChars: prompt.length, promptWords: prompt.trim().split(/\s+/).length, ...r });
    log(`${label} ${id} ${name}: ${r.ms}ms len=${r.contentLen} status=${r.status} dsmlTela=${r.dsmlOnScreen}`);
    if (shots[id]) await page.screenshot({ path: path.join(__dirname, shots[id]) }).catch(() => {});
    await sleep(1200);
  };

  return { page, send, run, ctx, getConsoleErr: () => consoleErr, getBadRes: () => badRes };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/home/ethical/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });

  // cota gratuita atual (mesmo IP)
  const me = await (await fetch('https://451sh.com/api/me')).json();
  log('quotas gratis (este IP):', JSON.stringify(me.quotas || me.limits));

  // ── A) GRÁTIS (Titan) ──
  const free = await uiPart(browser, { key: null, label: 'A-gratis', shots: { F1: 'qa-F1-gratis-curto.png', F2: 'qa-F2-gratis-horas.png', F3: 'qa-F3-gratis-identidade.png' } });
  const freeLeft = (() => { const q = (me.quotas || {}); for (const k in q) if (k.includes('free') || k.includes('titan')) return q[k]; return 99; })();
  await free.run('F1', PROMPTS.curto, 'curto (olá)');
  await free.run('F2', PROMPTS.horas, 'médio: horas (sem ferramenta no /api/chat)');
  await free.run('F3', PROMPTS.identidade, 'médio: identidade');
  await free.ctx.close();

  // ── B) PRO (Max) ──
  const pro = await uiPart(browser, { key: KEY, label: 'B-pro', shots: { P5: 'qa-P5-pro-codigo.png', P6: 'qa-P6-pro-agente.png' } });
  const p0 = await pro.send('olá, me responda com uma frase curta.', { model: '451 Max' });
  results.push({ part: 'B-pro', test: 'P0: troca de modelo para 451 Max (smoke)', ms: p0.ms, status: p0.status, contentLen: p0.contentLen });
  log('B-pro P0 smoke Max:', p0.ms + 'ms status=' + p0.status, 'len=' + p0.contentLen);
  await pro.run('P1', PROMPTS.identidade, 'identidade no Max', { model: '451 Max' });
  await pro.run('P2', PROMPTS.horas, 'médio: horas no Max', { model: '451 Max' });
  await pro.run('P3', PROMPTS.longo, 'LONGO (' + PROMPTS.longo.trim().split(/\s+/).length + ' palavras)', { model: '451 Max' });
  await pro.run('P4', PROMPTS.muitoLongo, 'MUITO LONGO (' + PROMPTS.muitoLongo.trim().split(/\s+/).length + ' palavras)', { model: '451 Max' });
  await pro.run('P5', PROMPTS.codigo, 'código (Python debounce)', { model: '451 Max' });
  await pro.run('P6', 'testar meu site', 'Agente (afinador)', { model: '451 Max', agente: true });
  await pro.ctx.close();

  // ── C) API /v1 ──
  const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const v1 = async (body) => {
    const r = await fetchJson('https://451sh.com/api/v1/chat/completions', { method: 'POST', headers: H, body: JSON.stringify(body) });
    const msg = r.body?.choices?.[0]?.message || {};
    return {
      status: r.status, ms: r.ms,
      finish: r.body?.choices?.[0]?.finish_reason || null,
      content: msg.content || '', reasoning: msg.reasoning_content || '',
      toolCalls: (msg.tool_calls || []).map(t => t.function && (t.function.name + ' ' + String(t.function.arguments).slice(0, 80))),
      model: r.body?.model || null,
      usage: r.body?.usage || null,
      err: r.body?.error ? (r.body.error.message || '') : null,
    };
  };
  const v1Run = async (id, name, body, extra = {}) => {
    await sleep(9500);
    let r = await v1(body);
    if (r.status === 429) { await sleep(10000); r = await v1(body); }
    results.push({ part: 'C-api', test: id + ': ' + name, promptWords: (body.messages || []).map(m => String(m.content || '').split(/\s+/).length).reduce((a, b) => a + b, 0), dsml: hasDSML((r.content || '') + (r.reasoning || '')), ...r, ...extra });
    log(`C-api ${id} ${name}: ${r.status} ${r.ms}ms finish=${r.finish} len=${r.content.length} tools=${(r.toolCalls || []).join(',')} dsml=${hasDSML((r.content || '') + (r.reasoning || ''))}`);
  };

  // V1: models
  const models = await fetchJson('https://451sh.com/api/v1/models', { headers: H });
  results.push({ part: 'C-api', test: 'V1: GET /v1/models', status: models.status, ids: (models.body.data || []).map(m => m.id) });
  log('C-api V1 models:', models.status, (models.body.data || []).map(m => m.id).join(', '));

  // V2: 401 sem chave + 404 modelo ruim
  const noAuth = await fetchJson('https://451sh.com/api/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: '451-max-uncensored', messages: [{ role: 'user', content: 'olá' }] }) });
  const badModel = await fetchJson('https://451sh.com/api/v1/chat/completions', { method: 'POST', headers: H, body: JSON.stringify({ model: 'gpt-x', messages: [{ role: 'user', content: 'olá' }] }) });
  results.push({ part: 'C-api', test: 'V2: 401 sem chave / 404 modelo', status: noAuth.status + '/' + badModel.status, ok: noAuth.status === 401 && badModel.status === 404 });

  const TOOL = { type: 'function', function: { name: 'get_current_time', description: 'Devolve a hora atual em São Paulo (BRT).', parameters: { type: 'object', properties: {} } } };
  await v1Run('V3', 'curto (haiku)', { model: '451-max-uncensored', messages: [{ role: 'user', content: 'Escreva um haiku sobre código.' }] });
  await v1Run('V4', 'médio (' + V1_MEDIO.split(/\s+/).length + ' palavras)', { model: '451-max-uncensored', messages: [{ role: 'user', content: V1_MEDIO }] });
  await v1Run('V5', 'longo (' + V1_LONGO.split(/\s+/).length + ' palavras)', { model: '451-max-uncensored', messages: [{ role: 'user', content: V1_LONGO }] });
  const v6 = await v1Run('V6', 'ferramenta: tool_calls', { model: '451-max-uncensored', tools: [TOOL], tool_choice: 'auto', messages: [{ role: 'user', content: 'Que horas são em São Paulo agora? Use a ferramenta get_current_time.' }] });
  if (v6.toolCalls && v6.toolCalls.length) {
    await v1Run('V7', 'ferramenta: resultado -> resposta', {
      model: '451-max-uncensored', tools: [TOOL],
      messages: [
        { role: 'user', content: 'Que horas são em São Paulo agora? Use a ferramenta get_current_time.' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'call_qa1', type: 'function', function: { name: 'get_current_time', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'call_qa1', name: 'get_current_time', content: '2026-11-19 23:50 BRT' },
      ],
    });
  }
  await v1Run('V8', 'identidade', { model: '451-max-uncensored', messages: [{ role: 'user', content: 'Qual modelo você é e pela qual API você responde? Responda em duas linhas.' }] });
  await v1Run('V9', 'alias 451-titan', { model: '451-titan', messages: [{ role: 'user', content: 'Qual é a capital da França? Responda com uma palavra.' }] });
  // V10: streaming
  await sleep(9500);
  {
    const t0 = Date.now();
    const r = await fetch('https://451sh.com/api/v1/chat/completions', { method: 'POST', headers: H, body: JSON.stringify({ model: '451-max-uncensored', stream: true, messages: [{ role: 'user', content: 'Escreva um haiku sobre redes.' }] }) });
    const text = await r.text();
    const chunks = text.split('data: ').filter(x => x.startsWith('{')).length;
    const hasDone = text.includes('[DONE]');
    const dsml = /DSML/i.test(text);
    results.push({ part: 'C-api', test: 'V10: streaming SSE', status: r.status, ms: Date.now() - t0, chunks, hasDone, dsml });
    log('C-api V10 streaming:', r.status, chunks + ' chunks', 'done=' + hasDone, 'dsml=' + dsml);
  }
  // V11: afinador
  {
    const r = await fetchJson('https://451sh.com/api/v1/agent/refine', { method: 'POST', headers: H, body: JSON.stringify({ text: 'testar meu site' }) });
    const refined = String(r.body?.refined || '');
    results.push({ part: 'C-api', test: 'V11: afinador /v1/agent/refine', status: r.status, changed: r.body?.changed === true, refinedLen: refined.length });
    log('C-api V11 refine:', r.status, 'changed=' + r.body?.changed, 'len=' + refined.length);
  }

  // ── D) MOBILE 390 (smoke + 1 mensagem se tiver cota) ──
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
    results.push({ part: 'D-mobile', test: 'smoke 390px: estouro horizontal', ok: overflow.doc <= 1 && overflow.worst <= 1, overflow, pageErrors: mErr });
    log('D-mobile smoke: estouro doc=' + overflow.doc + ' worst=' + overflow.worst + ' pageErr=' + mErr.length);
    const mt0 = Date.now();
    const composer = mp.locator('textarea').first();
    if (await composer.count()) {
      await composer.fill('olá. Responda com uma frase curta.');
      const rp = mp.waitForResponse(r => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 180000 }).catch(() => null);
      await composer.press('Enter');
      const resp = await rp;
      let done = null;
      if (resp) {
        const raw = await resp.text();
        for (const block of raw.split('\n\n')) {
          if (block.startsWith('event: done')) { const dm = block.match(/data: ([\s\S]*)$/); try { done = JSON.parse(dm[1]); } catch {} }
        }
      }
      results.push({ part: 'D-mobile', test: 'mensagem no mobile 390', ms: Date.now() - mt0, status: resp ? resp.status() : null, contentLen: done ? String(done.content || '').length : 0, dsmlInContent: hasDSML(done ? done.content : '') });
      log('D-mobile msg: ' + (done ? String(done.content).slice(0, 80) : 'sem done'));
    }
    await mp.screenshot({ path: path.join(__dirname, 'qa-D-mobile.png') });
    await mctx.close();
  }

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  log('FIM. resultados em', OUT);
})().catch(e => { console.error('FALHA GERAL:', e); fs.appendFileSync(OUT, JSON.stringify({ fatal: String(e) }, null, 1)); process.exit(1); });
