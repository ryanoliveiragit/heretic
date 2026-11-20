// Teste Imagens v3 + conversa que não some. Uso: node teste.mjs <base> <dir-prints> <img1> <img2>
// Imagens SIMULADAS (não gasta o RunPod); o chat usa o servidor local de verdade.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [BASE, O, IMG1, IMG2] = process.argv.slice(2);
const fake = [IMG1, IMG2].map((f) => `data:image/${f.endsWith('png') ? 'png' : 'webp'};base64,` + readFileSync(f).toString('base64'));
let n = 0; const pedidos = [];
const mock = async (route) => {
  const req = JSON.parse(route.request().postData() || '{}'); pedidos.push(req);
  await new Promise((r) => setTimeout(r, 3000));
  route.fulfill({ status: 200, contentType: 'application/json', body: '   ' + JSON.stringify({ image: fake[n++ % 2], prompt: 'simulated: ' + req.prompt, seed: 42, estilo: 'rapido', formato: req.formato === 'auto' ? '1:1' : req.formato, provider: 'simulado' }) });
};
const sug = (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: ['Deixe o céu roxo', 'Mais neon', 'Estilo anime'] }) });
const b = await PW.chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell' });
const r = {}; const ok = (k, v) => { r[k] = v; };
const caixa = (p) => p.locator('.h-pagina[data-on] textarea').first();
async function irImagens(p, mobile) {
  if (mobile) { await p.locator('.h-menu-btn').click(); await p.waitForTimeout(500); }
  await p.locator('.h-nav a', { hasText: 'Imagens' }).click(); await p.waitForTimeout(700);
}
async function irChat(p, mobile) {
  if (mobile) { await p.locator('.h-menu-btn').click(); await p.waitForTimeout(500); }
  await p.locator('.a-hist .h-hist-item').first().click(); await p.waitForTimeout(700);
}
// ---------------- computador
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.route('**/api/image', mock); await p.route('**/api/image/followups', sug);
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  // 1) chat real
  await caixa(p).fill('Responda em 3 frases: o que é um port scan?'); await p.keyboard.press('Enter');
  await p.waitForTimeout(2500);
  // 2) troca de aba no meio da resposta
  await irImagens(p); await p.waitForTimeout(9000);
  ok('imagens_modelo', await p.locator('.h-pagina[data-on] .hx-model-fixo').innerText().catch(() => null));
  ok('imagens_sem_anexar', await p.locator('.h-pagina[data-on] [aria-label^="Anexar"]').count() === 0);
  ok('imagens_sem_estilos', await p.locator('.h-pagina[data-on]').getByText('Sem filtro', { exact: true }).count() === 0);
  await p.screenshot({ path: `${O}/1-computador-imagens-vazia.png` });
  await p.locator('.h-pagina[data-on] .hx-chip-keep').click(); await p.waitForTimeout(500);
  ok('formato_opcoes', await p.locator('[role=menuitemradio]').allInnerTexts());
  await p.screenshot({ path: `${O}/2-computador-menu-formato.png` });
  await p.locator('[role=menuitemradio]', { hasText: 'Paisagem' }).click(); await p.waitForTimeout(300);
  ok('formato_escolhido', await p.locator('.h-pagina[data-on] .hx-chip-keep').innerText());
  await irChat(p);
  ok('chat_resposta_continuou', await p.locator('.h-pagina[data-on] .h-erro, .h-pagina[data-on] :text("A resposta foi interrompida")').count() === 0);
  ok('chat_resposta_chars', (await p.locator('.h-pagina[data-on]').innerText()).length);
  await p.screenshot({ path: `${O}/3-computador-chat-depois-da-troca.png` });
  // 3) gera imagem e troca de aba durante a geração
  await irImagens(p);
  await caixa(p).fill('uma cigarra cromada num terminal'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  await irChat(p); await p.waitForTimeout(3500); await irImagens(p); await p.waitForTimeout(800);
  ok('img_sobreviveu_troca', await p.locator('.h-pagina[data-on] .h-img-msg img').count());
  ok('formato_enviado', pedidos[0]?.formato); ok('estilo_enviado', pedidos[0]?.estilo); ok('melhorar_enviado', pedidos[0]?.melhorar);
  await caixa(p).fill('cidade cyberpunk na chuva'); await p.keyboard.press('Enter'); await p.waitForTimeout(4200);
  ok('img_feed', await p.locator('.h-pagina[data-on] .h-img-msg img').count());
  ok('sugestoes', await p.locator('.h-pagina[data-on] .h-img-sug .x-chip').count());
  await p.screenshot({ path: `${O}/4-computador-conversa-imagens.png` });
  // 4) recarrega: volta na página Imagens com a conversa
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  ok('reload_pagina', await p.locator('.h-titulo').innerText());
  ok('reload_feed', await p.locator('.h-pagina[data-on] .h-img-msg img').count());
  ok('reload_sugestoes', await p.locator('.h-pagina[data-on] .h-img-sug .x-chip').count());
  // 5) galeria e apagar
  await p.locator('.h-pagina[data-on] .h-img-barra').getByText(/Galeria/).click(); await p.waitForTimeout(600);
  ok('galeria_itens', await p.locator('.h-pagina[data-on] .h-gal-item').count());
  await p.screenshot({ path: `${O}/5-computador-galeria.png` });
  await p.locator('.h-pagina[data-on] .h-gal-item').first().hover(); await p.locator('.h-pagina[data-on] .h-gal-apagar').first().click(); await p.waitForTimeout(400);
  ok('galeria_depois_apagar', await p.locator('.h-pagina[data-on] .h-gal-item').count());
  await p.locator('.h-pagina[data-on] .h-img-barra').getByText('Criar').click(); await p.waitForTimeout(500);
  ok('feed_depois_apagar', await p.locator('.h-pagina[data-on] .h-img-msg img').count());
  await p.locator('.h-pagina[data-on] .h-img-barra').getByText('Apagar conversa').click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${O}/6-computador-confirma-apagar.png` });
  await p.locator('.m-fundo, [role=dialog]').getByRole('button', { name: 'Apagar conversa' }).click(); await p.waitForTimeout(600);
  ok('feed_depois_apagar_conversa', await p.locator('.h-pagina[data-on] .h-img-msg').count());
  await p.locator('.h-pagina[data-on] .h-img-barra').getByText(/Galeria/).click(); await p.waitForTimeout(500);
  ok('galeria_mantida', await p.locator('.h-pagina[data-on] .h-gal-item').count());
  // 6) chat: reabre na conversa e apaga pelo topo
  await irChat(p); await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  ok('reload_chat_titulo', await p.locator('.h-titulo').innerText());
  ok('reload_chat_tem_msgs', await p.locator('.h-pagina[data-on] [data-slot=message]').count());
  await p.locator('.h-apagar-conv').click(); await p.waitForTimeout(400);
  await p.locator('[role=dialog]').getByRole('button', { name: 'Apagar conversa' }).click(); await p.waitForTimeout(600);
  ok('chat_apagado_titulo', await p.locator('.h-titulo').innerText());
  ok('chat_historico', await p.locator('.a-hist .h-hist-item').count());
  ok('erros_computador', erros);
  await ctx.close();
}
// ---------------- celular
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.route('**/api/image', mock); await p.route('**/api/image/followups', sug);
  await p.goto(BASE + '/app/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await irImagens(p, true);
  await p.screenshot({ path: `${O}/7-celular-imagens-vazia.png` });
  await p.locator('.h-pagina[data-on] .hx-chip-keep').click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${O}/8-celular-menu-formato.png` });
  await p.locator('[role=menuitemradio]', { hasText: 'Retrato' }).click(); await p.waitForTimeout(300);
  for (const t of ['uma cigarra cromada', 'retrato noir neon', 'paisagem de montanha']) { await caixa(p).fill(t); await p.keyboard.press('Enter'); await p.waitForTimeout(300); }
  await p.waitForTimeout(4500);
  await p.screenshot({ path: `${O}/9-celular-conversa.png` });
  await p.locator('.h-pagina[data-on] .h-img-barra').getByText(/Galeria/).click(); await p.waitForTimeout(600);
  await p.screenshot({ path: `${O}/10-celular-galeria.png` });
  ok('celular_galeria', await p.locator('.h-pagina[data-on] .h-gal-item').count());
  ok('celular_estouro', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  ok('erros_celular', erros);
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(r, null, 1));
