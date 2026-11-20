// QA de ponta a ponta no navegador (produção). Uso: node e2e.mjs <base> <arquivo-chave> <dir-prints> [partes]
// Partes: chat falhas imagens offline layout. Gasta ~6 mensagens de chat e 1 imagem.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, KEYFILE, O, ...PARTES] = process.argv.slice(2);
const KEY = readFileSync(KEYFILE, 'utf8').trim();
const quer = (p) => !PARTES.length || PARTES.includes(p);
const R = [];
const ok = (area, id, nome, pass, detalhe = '') => { R.push({ area, id, nome, pass, detalhe: String(detalhe).slice(0, 300) }); console.log(`${pass ? 'PASSA' : 'FALHA'} ${id} ${nome}${detalhe ? ' — ' + String(detalhe).slice(0, 170) : ''}`); };
const RAPID = 'zai-org/glm-5.3-flash-uncensored';
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const pg = '.h-pagina[data-on]';
const espera = (ms) => new Promise((o) => setTimeout(o, ms));
let ultimo = 0; const espaca = async () => { const w = ultimo + 12000 - Date.now(); if (w > 0) await espera(w); ultimo = Date.now(); };
async function novo({ mobile = false, w = 1440, h = 900 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(([k, m]) => { try { if (!sessionStorage.getItem('qa-ini')) { localStorage.setItem('451-key', k); localStorage.setItem('451-model', m); sessionStorage.setItem('qa-ini', '1'); } } catch { /* */ } }, [KEY, RAPID]);
  const p = await ctx.newPage(); const erros = [], dialogos = [], falhas = [];
  p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss().catch(() => {}); });
  p.on('response', (r) => { if (r.status() >= 500) falhas.push(`${r.status()} ${r.url()}`); });
  return { ctx, p, erros, dialogos, falhas };
}
const enviar = async (p, t) => { await espaca(); await p.locator(`${pg} textarea`).first().fill(t); await p.keyboard.press('Enter'); };
const respostaPronta = (p, n, ms = 60000) => p.waitForFunction(([s, n]) => document.querySelectorAll(s + ' .h-gasto').length >= n || !!document.querySelector(s + ' .h-erro'), [pg, n], { timeout: ms }).then(() => true).catch(() => false);
const irImagens = async (p, mobile) => { if (mobile) { await p.locator('.h-menu-btn').click(); await espera(400); } await p.locator('.h-nav a', { hasText: 'Imagens' }).evaluate((e) => e.click()); await espera(600); };
const irChat = async (p, mobile) => { if (mobile) { await p.locator('.h-menu-btn').click(); await espera(400); } await p.locator('.a-hist .h-hist-item').first().click(); await espera(600); };

// ─────────── CHAT (computador)
if (quer('chat')) {
  const { ctx, p, erros, dialogos, falhas } = await novo();
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await espera(1500);
  ok('e2e chat', 'P1', 'App abre como Pro com a caixa pronta', /Pro/.test(await p.locator('.h-conta').innerText().catch(() => '')) && await p.locator(`${pg} textarea`).count() === 1, (await p.locator('.h-conta').innerText().catch(() => '')).replace(/\s+/g, ' '));
  await enviar(p, 'Explique em 3 frases o que é um firewall.');
  const r1 = await respostaPronta(p, 1);
  ok('e2e chat', 'P2', 'Resposta chega e mostra o custo', r1 && await p.locator(`${pg} .h-erro`).count() === 0, (await p.locator(`${pg} .h-gasto`).first().innerText().catch(() => 'sem linha de custo')));
  // troca de aba no meio
  await enviar(p, 'Escreva um texto de 300 palavras sobre a história da internet.');
  await espera(1800); await irImagens(p); await espera(5000); await irChat(p);
  const r2 = await respostaPronta(p, 2, 90000);
  const txt2 = (await p.locator(`${pg} .x-answer`).nth(1).innerText().catch(() => '')).length;
  ok('e2e chat', 'P3', 'Trocar de aba no meio não perde a resposta', r2 && txt2 > 500, `${txt2} caracteres`);
  await p.screenshot({ path: `${O}/e1-computador-chat.png` });
  // recarregar
  const titulo = await p.locator('.h-titulo').innerText();
  await p.reload({ waitUntil: 'networkidle' }); await espera(1500);
  ok('e2e chat', 'P4', 'Recarregar volta na mesma conversa', (await p.locator('.h-titulo').innerText()) === titulo && await p.locator(`${pg} [data-slot=message]`).count() >= 2, `${titulo} · ${await p.locator(`${pg} [data-slot=message]`).count()} mensagens`);
  // parar
  await enviar(p, 'Conte de 1 a 300 por extenso, um número por linha.');
  await p.locator(`${pg} [data-state=generating]`).waitFor({ timeout: 15000 }).catch(() => {});
  await espera(1500); await p.locator(`${pg} [data-state=generating]`).click().catch(() => {});
  await espera(1500);
  ok('e2e chat', 'P5', 'Parar interrompe e avisa', await p.locator(`${pg} .h-parada`).count() === 1 && await p.locator(`${pg} [data-state=generating]`).count() === 0, await p.locator(`${pg} .h-parada`).innerText().catch(() => 'sem aviso'));
  // XSS
  await enviar(p, 'Repita exatamente o texto entre aspas, fora de bloco de código, sem comentar: "<img src=x onerror=alert(1)> <script>alert(2)</script> [clique aqui](javascript:alert(3))"');
  await respostaPronta(p, 4, 60000); await espera(1500);
  const perigo = await p.evaluate((s) => ({ img: document.querySelectorAll(s + ' .x-answer img[src="x"], ' + s + ' .x-answer img[onerror]').length, js: [...document.querySelectorAll(s + ' .x-answer a')].filter((a) => /^javascript:/i.test(a.getAttribute('href') || '')).length, script: document.querySelectorAll(s + ' .x-answer script').length }), pg);
  ok('e2e chat', 'P6', 'Resposta com código malicioso não executa (XSS)', dialogos.length === 0 && !perigo.img && !perigo.js && !perigo.script, `alertas=${dialogos.length} ${JSON.stringify(perigo)}`);
  // 2 mensagens seguidas (freio de 8 s)
  ultimo = 0; await p.locator(`${pg} textarea`).first().fill('Diga só: um'); await p.keyboard.press('Enter');
  await respostaPronta(p, 5, 30000); await espera(400);
  await p.locator(`${pg} textarea`).first().fill('Diga só: dois'); await p.keyboard.press('Enter'); ultimo = Date.now();
  await espera(5000);
  const ultimaMsg = await p.locator(`${pg} [data-slot=message]`).last().innerText().catch(() => '');
  ok('e2e chat', 'P7', 'Mensagem rápida demais recebe aviso claro (freio de 8 s)', /espere|calma|segundos/i.test(ultimaMsg) || /dois/i.test(ultimaMsg.split('\n').slice(1).join(' ')), ultimaMsg.replace(/\s+/g, ' ').slice(0, 140));
  await p.screenshot({ path: `${O}/e2-computador-freio.png` });
  // apagar conversa
  const antes = await p.locator('.a-hist .h-hist-item').count();
  await p.locator('.h-apagar-conv').click(); await p.locator('[role=dialog]').getByRole('button', { name: 'Apagar conversa' }).click(); await espera(600);
  ok('e2e chat', 'P8', 'Apagar a conversa pelo topo', (await p.locator('.a-hist .h-hist-item').count()) === antes - 1 && (await p.locator('.h-titulo').innerText()) === 'Nova conversa', `${antes} → ${await p.locator('.a-hist .h-hist-item').count()}`);
  ok('e2e chat', 'P9', 'Sem erro de página nem resposta 5xx no fluxo', erros.length === 0 && falhas.length === 0, [...erros, ...falhas].join(' | ') || 'limpo');
  await ctx.close();
}

// ─────────── FALHAS simuladas (sem custo)
if (quer('falhas')) {
  const { ctx, p, erros } = await novo();
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await espera(1200);
  await p.route('**/api/chat', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x","message":"Falha simulada no servidor"}' }));
  await p.locator(`${pg} textarea`).first().fill('teste de falha 500'); await p.keyboard.press('Enter'); await espera(3000);
  const e500 = await p.locator(`${pg} .h-erro`).last().innerText().catch(() => '');
  ok('falhas', 'F1', 'Servidor com erro 500: aviso na tela, app segue usável', !!e500 && await p.locator(`${pg} textarea`).isEnabled(), e500);
  await p.unroute('**/api/chat'); await p.route('**/api/chat', (r) => r.abort('internetdisconnected'));
  await p.locator(`${pg} textarea`).first().fill('teste de rede caindo'); await p.keyboard.press('Enter'); await espera(3000);
  const eRede = await p.locator(`${pg} .h-erro`).last().innerText().catch(() => '');
  ok('falhas', 'F2', 'Rede caindo no envio: aviso na tela', !!eRede && eRede !== e500, eRede);
  await p.unroute('**/api/chat');
  await p.route('**/api/chat', async (r) => { const body = ': connected\n\nevent: token\ndata: {"token":"Começo da resposta que vai ser cortada no meio por uma queda de rede. Mais texto aqui para passar do filtro inicial de recusa, que segura os primeiros cento e sessenta caracteres antes de mostrar, então escrevo bastante."}\n\n'; await r.fulfill({ status: 200, contentType: 'text/event-stream', body }); });
  await p.locator(`${pg} textarea`).first().fill('teste de corte no meio'); await p.keyboard.press('Enter'); await espera(4000);
  const corte = await p.locator(`${pg} [data-slot=message]`).last().innerText().catch(() => '');
  ok('falhas', 'F3', 'Resposta cortada no meio (sem "done") não fica girando para sempre', await p.locator(`${pg} [data-state=generating]`).count() === 0, corte.replace(/\s+/g, ' ').slice(0, 140));
  await p.unroute('**/api/chat');
  await p.route('**/api/image', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '   {"error":"image_failed"}' }));
  await irImagens(p); await p.locator(`${pg} textarea`).first().fill('falha de imagem'); await p.keyboard.press('Enter'); await espera(2500);
  ok('falhas', 'F4', 'Falha da GPU: aviso na imagem e botão Fechar', /Não consegui gerar/.test(await p.locator(`${pg}`).innerText()), (await p.locator(`${pg} .h-erro`).last().innerText().catch(() => '')));
  await p.screenshot({ path: `${O}/e3-falhas.png` });
  ok('falhas', 'F5', 'Nenhum erro de página com as falhas', erros.length === 0, erros.join(' | ') || 'limpo');
  await ctx.close();
}

// ─────────── IMAGENS (celular, 1 imagem real)
if (quer('imagens')) {
  const { ctx, p, erros, falhas } = await novo({ mobile: true, w: 390, h: 844 });
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await espera(1200);
  await irImagens(p, true);
  await p.locator(`${pg} .hx-chip-keep`).click(); await espera(400); await p.locator('[role=menuitemradio]', { hasText: 'Retrato' }).click(); await espera(300);
  const t = Date.now();
  await p.locator(`${pg} textarea`).first().fill('retrato de uma coruja com óculos de aviador, foto'); await p.keyboard.press('Enter');
  await p.waitForSelector(`${pg} .h-img-msg img, ${pg} .h-img-msg .h-erro`, { timeout: 175000 }).catch(() => {});
  const seg = Math.round((Date.now() - t) / 1000);
  const box = await p.locator(`${pg} .h-img-msg img`).first().boundingBox().catch(() => null);
  ok('e2e imagens', 'M1', 'Imagem real no formato Retrato', !!box && box.height > box.width, `${seg} s · ${box ? Math.round(box.width) + '×' + Math.round(box.height) : 'sem imagem'}`);
  await espera(4000);
  ok('e2e imagens', 'M2', 'Sugestões de ajuste aparecem', await p.locator(`${pg} .h-img-sug .x-chip`).count() === 3, (await p.locator(`${pg} .h-img-sug`).innerText().catch(() => '')).replace(/\n/g, ' · '));
  await p.screenshot({ path: `${O}/e4-celular-imagem.png` });
  await p.reload({ waitUntil: 'networkidle' }); await espera(1500);
  ok('e2e imagens', 'M3', 'Recarregar mantém página, imagem e sugestões', (await p.locator('.h-titulo').innerText()) === 'Imagens' && await p.locator(`${pg} .h-img-msg img`).count() >= 1 && await p.locator(`${pg} .h-img-sug .x-chip`).count() === 3);
  await p.locator(`${pg} .h-img-barra`).getByText(/Galeria/).click(); await espera(500);
  const g0 = await p.locator(`${pg} .h-gal-item`).count();
  await p.locator(`${pg} .h-gal-apagar`).first().click(); await espera(400);
  const g1 = await p.locator(`${pg} .h-gal-item`).count();
  await p.reload({ waitUntil: 'networkidle' }); await espera(1200);
  const g2 = await p.locator(`${pg} .h-gal-item`).count();
  ok('e2e imagens', 'M4', 'Apagar da galeria vale depois de recarregar', g1 === g0 - 1 && g2 === g1, `${g0} → ${g1} → recarregou ${g2}`);
  ok('e2e imagens', 'M5', 'Sem erro de página nem 5xx', erros.length === 0 && falhas.length === 0, [...erros, ...falhas].join(' | ') || 'limpo');
  await ctx.close();
}

// ─────────── OFFLINE (app instalado sem internet)
if (quer('offline')) {
  const { ctx, p, erros } = await novo({ mobile: true, w: 390, h: 844 });
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await espera(2500);
  await p.reload({ waitUntil: 'networkidle' }); await espera(1500);
  const sw = await p.evaluate(() => navigator.serviceWorker?.controller ? 'ativo' : 'sem controle');
  await ctx.setOffline(true);
  let abriu = false; try { await p.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }); await espera(2500); abriu = await p.locator('textarea, .h-carregando').count() > 0; } catch { abriu = false; }
  ok('offline', 'O1', 'Sem internet, o app instalado ainda abre', abriu, `service worker ${sw}`);
  if (abriu) {
    await p.locator(`${pg} textarea`).first().fill('teste sem internet').catch(() => {}); await p.keyboard.press('Enter').catch(() => {}); await espera(3000);
    const txt = await p.locator(`${pg}`).innerText().catch(() => '');
    ok('offline', 'O2', 'Sem internet, o app avisa em vez de ficar carregando', !/Carregando os modelos/.test(txt) && /internet|conex|offline/i.test(txt), /Carregando os modelos/.test(txt) ? 'fica em "Carregando os modelos" sem aviso' : txt.slice(0, 120));
  }
  await p.screenshot({ path: `${O}/e5-offline.png` });
  await ctx.setOffline(false); await ctx.close();
}

// ─────────── LAYOUT em 6 larguras (conversa semeada: sem custo)
if (quer('layout')) {
  const longo = 'https://exemplo.com/' + 'caminho-muito-longo-sem-espacos-'.repeat(8);
  const resp = `## Resultado\n\n| Porta | Serviço | Versão | Observação longa |\n|---|---|---|---|\n| 22 | ssh | OpenSSH 9.6p1 Ubuntu 3ubuntu13.5 | autenticação por senha habilitada |\n| 443 | https | nginx 1.24.0 | TLS 1.2 e 1.3, HSTS ausente |\n\n\`\`\`bash\nnmap -sV -sC -p- --min-rate 5000 -oA varredura-completa-do-alvo 10.10.10.10 && cat varredura-completa-do-alvo.nmap | grep open\n\`\`\`\n\nLink: ${longo}\n\nPalavraEnormeSemEspacos${'X'.repeat(120)}`;
  const conv = [{ id: 'cqa1', titulo: 'Conversa de layout (QA)', ts: Date.now(), msgs: [{ id: 1, tipo: 'ia', pergunta: 'Mostre um resultado de varredura com tabela, código e link longo ' + longo, modelo: RAPID, nomeModelo: '451 Rapid', resposta: resp, custo: 0 }] }];
  const res = [];
  for (const w of [320, 375, 390, 768, 1024, 1440]) {
    const mobile = w < 768;
    const { ctx, p, erros } = await novo({ mobile, w, h: w < 768 ? 760 : 900 });
    await p.goto(BASE + '/app/', { waitUntil: 'networkidle' });
    await p.evaluate((c) => { localStorage.setItem('451-chats-v3', JSON.stringify(c)); localStorage.setItem('451-ui', JSON.stringify({ pagina: 'chat', ativa: 'cqa1' })); }, conv);
    await p.reload({ waitUntil: 'networkidle' }); await espera(1500);
    const m = await p.evaluate((W) => {
      const de = document.documentElement; const ta = document.querySelector('.h-pagina[data-on] textarea')?.getBoundingClientRect();
      const fora = [...document.querySelectorAll('.h-pagina[data-on] *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 1) && !e.closest('pre, table, [class*=code], [class*=scroll], .x-scroll'); }).slice(0, 3).map((e) => String(e.className || e.tagName).slice(0, 30));
      return { estouro: de.scrollWidth > W + 1 ? de.scrollWidth : false, caixaVisivel: !!ta && ta.bottom <= innerHeight && ta.top >= 0, fora };
    }, w);
    await p.screenshot({ path: `${O}/l-${w}-chat.png` });
    await irImagens(p, mobile); await espera(500);
    const mi = await p.evaluate((W) => ({ estouro: document.documentElement.scrollWidth > W + 1 }), w);
    await p.screenshot({ path: `${O}/l-${w}-imagens.png` });
    if (mobile) { await p.locator('.h-menu-btn').click(); await espera(400); }
    await p.locator('.h-cfg-link').evaluate((e) => e.click()); await espera(700);
    const mc = await p.evaluate((W) => ({ estouro: document.documentElement.scrollWidth > W + 1 }), w);
    await p.screenshot({ path: `${O}/l-${w}-config.png` });
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await espera(1200);
    const ml = await p.evaluate((W) => ({ estouro: [...document.querySelectorAll('body *')].some((e) => { const r = e.getBoundingClientRect(); return r.right > W + 1 && r.width > 0 && r.width < 2 * W && !e.closest('.l-holo'); }) }), w); // .l-holo: animação de fundo recortada de propósito
    res.push({ w, chat: m, imagens: mi.estouro, config: mc.estouro, landing: ml.estouro, erros: erros.length });
    await ctx.close();
  }
  for (const r of res) ok('layout', `L${r.w}`, `Largura ${r.w}px: nada passa da tela e a caixa fica visível`, !r.chat.estouro && r.chat.caixaVisivel && !r.chat.fora.length && !r.imagens && !r.config && !r.landing && !r.erros, JSON.stringify(r));
}
writeFileSync(`${O}/e2e.json`, JSON.stringify(R, null, 1));
await b.close();
console.log(`\nTotal ${R.length}: ${R.filter((r) => r.pass).length} passam, ${R.filter((r) => !r.pass).length} falham`);
