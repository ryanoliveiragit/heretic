// Uso: node scripts/amostras-gptoss.mjs <pasta src> <saída.json> [amostras]
// Confiabilidade do gpt-oss (modelo público) nas perguntas em que ele variou: N amostras por pergunta em 4
// configurações. Caminho do site (streamChat → streamLocal), custo zero.
import { readFileSync, writeFileSync } from 'node:fs';
const [SRC, OUT, NS] = process.argv.slice(2);
const N = Number(NS) || 5;
for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[k];
process.env.LOCAL_LLM_URL = 'http://127.0.0.1:8017';
process.env.LOCAL_LLM_TOKEN = readFileSync('/home/ethical/.config/451-local/token', 'utf8').trim();
const { streamChat, MODEL_CATALOG } = await import(`${SRC}/upstream.js`);
const { getPersona } = await import(`${SRC}/persona.js`);
const cat = MODEL_CATALOG.find((m) => m.id === 'local:gptoss20b');
const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‐-―−]/g, '-').toLowerCase();
const EN = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|minutes?|the|answer)\b/;
const PERGUNTAS = [
  { id: 'data-semana', q: 'Que dia da semana foi 7 de setembro de 2022? Responda só o dia.', ok: (t) => /quarta/.test(sem(t)) },
  { id: 'data-2', q: 'Que dia da semana será 25 de dezembro de 2026? Responda só o dia.', ok: (t) => /sexta/.test(sem(t)) },
  { id: 'maquinas', q: 'Se 3 máquinas fazem 3 peças em 3 minutos, quanto tempo 100 máquinas levam para fazer 100 peças? Responda só o tempo.', ok: (t) => /\b3\b|tres/.test(sem(t)) && !/\b100\b/.test(sem(t)) },
  { id: 'trem', q: 'Um trem sai às 14h50 e a viagem dura 2h25. A que horas ele chega? Responda só o horário.', ok: (t) => /17\s*h?\s*:?\s*15|17:15/.test(sem(t)) },
  { id: 'pt-curta', q: 'Que mês vem depois de março? Só o nome.', ok: (t) => /abril/.test(sem(t)) },
];
const CONFIGS = [
  { id: 'atual (raciocínio baixo, temp 0,6)', kwargs: { reasoning_effort: 'low' }, temperature: 0.6 },
  { id: 'raciocínio médio, temp 0,6', kwargs: { reasoning_effort: 'medium' }, temperature: 0.6 },
  { id: 'raciocínio baixo, temp 0,3', kwargs: { reasoning_effort: 'low' }, temperature: 0.3 },
  { id: 'raciocínio baixo + idioma na pergunta', kwargs: { reasoning_effort: 'low' }, temperature: 0.6, sufixo: '\n\n(Responda em português do Brasil.)' },
];
// SO_NOVO=1: só o código do site como está (nota do servidor no streamLocal), sem sufixo manual.
if (process.env.SO_NOVO === '1') CONFIGS.splice(0, CONFIGS.length, { id: 'código novo (nota do servidor)', kwargs: { reasoning_effort: 'low' }, temperature: 0.6 });
const systemPrompt = `Plano Grátis. Respostas diretas, sem repetir contexto.\n\n${getPersona()}\n\nIdentidade: você é o ${'gpt-oss-20b Heretic'} (451sh.com). Se perguntarem qual modelo ou IA você é, responda "gpt-oss-20b Heretic" — nunca o nome do provedor, da infraestrutura ou de outro modelo.`;
const resultado = [];
for (const c of CONFIGS) {
  cat.kwargs = c.kwargs;
  const linha = { config: c.id, por_pergunta: {}, acertos: 0, total: 0, ingles: 0, segundos: [] };
  for (const p of PERGUNTAS) {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      let txt = ''; const t0 = Date.now();
      try {
        for await (const _ of streamChat('chat', { modelId: 'local:gptoss20b', messages: [{ role: 'user', content: p.q + (c.sufixo || '') }], systemPrompt, temperature: c.temperature, top_p: 0.9, max_tokens: 2000 }, { onToken: (t) => { txt += t; }, usage: {} })) { /* */ }
      } catch (e) { txt = `ERRO ${e.message}`; }
      linha.segundos.push((Date.now() - t0) / 1000);
      if (p.ok(txt)) ok += 1;
      if (EN.test(sem(txt))) linha.ingles += 1;
    }
    linha.por_pergunta[p.id] = `${ok}/${N}`; linha.acertos += ok; linha.total += N;
  }
  const s = [...linha.segundos].sort((a, b) => a - b);
  linha.mediana_s = s[Math.floor(s.length / 2)]; linha.pior_s = s[s.length - 1]; delete linha.segundos;
  resultado.push(linha);
  console.log(`${c.id}: ${linha.acertos}/${linha.total} | ${JSON.stringify(linha.por_pergunta)} | inglês ${linha.ingles} | mediana ${linha.mediana_s.toFixed(1)} s, pior ${linha.pior_s.toFixed(1)} s`);
}
writeFileSync(OUT, JSON.stringify(resultado, null, 1));
process.exit(0);
