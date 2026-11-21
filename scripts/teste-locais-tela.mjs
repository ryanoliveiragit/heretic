// Uso: node scripts/teste-locais-tela.mjs <url do app> <arquivo com a chave de admin ou a própria chave de teste> <pasta dos prints> [modelos separados por vírgula]
// Modelos locais pela tela do 451, como administrador: manda uma mensagem para cada modelo local, fotografa
// o aviso enquanto espera (fila ou troca de modelo) e a resposta. Custo zero: os modelos rodam no computador do 451.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
const PW = createRequire('/home/ethical/orca/nevus-odonto/package.json')('playwright-core');
const [URL, CHAVE, OUT, LISTA] = process.argv.slice(2);
const KEY = existsSync(CHAVE) ? readFileSync(CHAVE, 'utf8').trim() : CHAVE;
const MODELOS = (LISTA || 'local:qwen35b,local:gemma26b,local:gptoss20b').split(',');
const PERGUNTA = { 'local:qwen35b': 'Em duas frases: o que é um ataque de força bruta?', 'local:gemma26b': 'Em duas frases: o que é phishing?', 'local:gptoss20b': 'Em duas frases: o que é um keylogger?' };

const b = await PW.chromium.launch();
const resultado = [];
for (const [i, modelo] of MODELOS.entries()) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(([k, m]) => { try { localStorage.setItem('451-key', k); localStorage.setItem('451-model', m); } catch { /* */ } }, [KEY, modelo]);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  if (i === 0) {
    // o seletor de modelo com o grupo "Modelos locais"
    const botao = page.getByRole('button', { name: /Qwen 35B|Gemma 26B|gpt-oss 20B|Modelo/ }).first();
    await botao.click().catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/0-seletor.png` });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }
  const caixa = page.locator('textarea').first();
  await caixa.waitFor({ timeout: 30000 });
  const resposta = page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 60000 });
  const t0 = Date.now();
  await caixa.fill(PERGUNTA[modelo] || 'Responda em uma frase: tudo certo?');
  await caixa.press('Enter');
  // aviso enquanto espera: fotografa a tela aos ~4 s e guarda o texto do rótulo
  await page.waitForTimeout(4000);
  const rotulo = await page.getByText(/Você está na fila|Trocando de modelo|Pensando/).first().textContent().catch(() => '');
  await page.screenshot({ path: `${OUT}/${i + 1}-${modelo.split(':')[1]}-espera.png` });
  const r = await resposta;
  const corpo = await r.text().catch(() => '');
  const fim = corpo.split('\n\n').find((x) => x.startsWith('event: done'));
  const erro = corpo.split('\n\n').find((x) => x.startsWith('event: error'));
  const texto = fim ? JSON.parse(fim.split('data: ')[1]).content : '';
  const avisos = corpo.split('\n\n').filter((x) => x.startsWith('event: warning') && x.includes('"fila"')).map((x) => JSON.parse(x.split('data: ')[1]).message).filter(Boolean);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${i + 1}-${modelo.split(':')[1]}-resposta.png` });
  resultado.push({ modelo, http: r.status(), segundos: Math.round((Date.now() - t0) / 100) / 10, rotulo_aos_4s: (rotulo || '').trim().slice(0, 90), avisos_de_fila: [...new Set(avisos)], resposta: texto.slice(0, 160), erro: erro ? JSON.parse(erro.split('data: ')[1]).message : null, erros_de_pagina: erros });
  await ctx.close();
}
console.log(JSON.stringify(resultado, null, 1));
await b.close();
