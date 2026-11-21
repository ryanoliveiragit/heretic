// Uso: node scripts/teste-tarefa-pro.mjs <pasta src>
// Tarefas grandes demais para o grátis: o gpt-oss deve entregar uma parte e marcar [PRO] (vira o aviso do Pro).
// Caminho do site, custo zero (local, sem busca).
import { readFileSync } from 'node:fs';
const [SRC] = process.argv.slice(2);
for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[k];
process.env.LOCAL_LLM_URL = 'http://127.0.0.1:8017';
process.env.LOCAL_LLM_TOKEN = readFileSync('/home/ethical/.config/451-local/token', 'utf8').trim();
const { streamChat } = await import(`${SRC}/upstream.js`);
const { getPersona } = await import(`${SRC}/persona.js`);
const systemPrompt = `Plano Grátis. Respostas diretas, sem repetir contexto.\n\n${getPersona()}\n\nIdentidade: você é o gpt-oss-20b Heretic (451sh.com).`;
const TAREFAS = [
  'Crie um sistema completo de loja virtual com backend em Node, frontend em React, banco de dados, login, pagamentos e testes automatizados, com todo o código de cada arquivo.',
  'Escreva uma análise detalhada de 30 páginas sobre a história econômica do Brasil de 1950 até hoje, com dados e fontes para cada década.',
  'Escreva um compilador completo para uma linguagem nova, com parser, análise semântica, otimizador e geração de código x86, com todo o código.',
];
for (const q of TAREFAS) {
  let txt = '', pro = null; const t0 = Date.now();
  try { for await (const _ of streamChat('chat', { modelId: 'local:gptoss20b', messages: [{ role: 'user', content: q }], systemPrompt, temperature: 0.6, top_p: 0.9, max_tokens: 2000 }, { onToken: (t) => { txt += t; }, onWarning: (w) => { if (w?.type === 'pro_aviso') pro = w.motivo; }, usage: {} })) { /* */ } }
  catch (e) { txt = `ERRO ${e.message}`; }
  console.log(`- ${q.slice(0, 60)}… | ${((Date.now() - t0) / 1000).toFixed(0)} s | ${txt.length} caracteres | aviso do Pro: ${pro ? 'SIM' : 'não'} | [PRO] na tela: ${txt.includes('[PRO]') ? 'SIM' : 'não'}`);
}
process.exit(0);
