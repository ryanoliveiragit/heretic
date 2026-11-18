/**
 * Teste longo do DOD: uma conversa de 200 mensagens sem erro, com o custo e o
 * acerto de cache medidos por turno. Mede o que o /api/chat reporta no evento
 * `done`; provedor que não devolve cache token aparece como cache 0.
 *
 *   BASE=http://localhost:3000 N=200 node --env-file=.env eval/soak.mjs
 */
import fs from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3000";
const N = Number(process.env.N ?? 200);
const TAG = process.argv[2] ?? "soak";
let fp = `soak-${Date.now()}`;
let trocasCota = 0;

const SEMEIA = [
  "o que é entropia",
  "explique DNS em duas frases",
  "tabs ou espaços",
  "por que o céu é azul",
  "o que é JWT",
  "diferença entre TCP e UDP",
  "o que faz o comando grep",
  "vale a pena aprender Rust em 2026",
];

const hist = [];
const turnos = [];

for (let i = 0; i < N; i++) {
  const texto = SEMEIA[i % SEMEIA.length];
  const t0 = Date.now();
  let erro = null, tokens = 0, done = null;
  // 502/504 do provedor são transitórios: o teste é de estabilidade do app,
  // não do humor da Venice, então o mesmo turno é repetido até 2 vezes.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
  erro = null; tokens = 0; done = null;
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-heretic-client": fp },
      body: JSON.stringify({ text: texto, history: hist, conversationId: TAG }),
    });
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      erro = corpo?.error?.code ?? `http_${res.status}`;
    } else {
      const raw = await res.text();
      for (const m of raw.matchAll(/^event: (\w+)\ndata: (.*)$/gm)) {
        if (m[1] === "token") tokens++;
        else if (m[1] === "error") erro = JSON.parse(m[2]).code;
        else if (m[1] === "done") done = JSON.parse(m[2]);
      }
    }
  } catch (e) {
    erro = e?.message ?? "fetch";
  }
  if (erro === "upstream_unavailable" && tentativa < 2) {
    await new Promise((r) => setTimeout(r, 1500));
    continue;
  }
  break;
  }

  const linha = {
    i, ms: Date.now() - t0, erro, tokens,
    cost_usd: done?.cost_usd ?? 0,
    prompt_tokens: done?.prompt_tokens ?? 0,
    cached_tokens: done?.cached_tokens ?? 0,
    retried: !!done?.retried,
  };
  turnos.push(linha);
  if (done?.content) {
    hist.push({ role: "user", content: texto }, { role: "assistant", content: done.content });
    if (hist.length > 80) hist.splice(0, hist.length - 80);
  }
  console.log(`${String(i + 1).padStart(3)} ${linha.ms}ms erro=${erro ?? "-"} cache=${linha.cached_tokens}/${linha.prompt_tokens} $${linha.cost_usd}`);
  // A cota diária é por conta (20k tokens). Ela não é o alvo do teste de 200
  // mensagens, então ao bater na cota o soak troca de conta e segue contando.
  if (erro === "daily_token_limit") {
    trocasCota++;
    fp = `soak-${Date.now()}-${i}`;
    turnos.at(-1).erro = null;
    turnos.at(-1).cota_trocada = true;
    continue;
  }
  if (erro) break;
  await new Promise((r) => setTimeout(r, 300));
}

const ok = turnos.filter((t) => !t.erro);
const comCache = ok.filter((t) => t.prompt_tokens > 0);
const somaPrompt = comCache.reduce((a, t) => a + t.prompt_tokens, 0);
const somaCache = comCache.reduce((a, t) => a + t.cached_tokens, 0);
const custo = turnos.reduce((a, t) => a + t.cost_usd, 0);
const lat = ok.map((t) => t.ms).sort((a, b) => a - b);

const resumo = {
  tag: TAG, n: turnos.length, erros: turnos.filter((t) => t.erro).map((t) => ({ i: t.i, erro: t.erro })),
  turnos_com_cota_trocada: trocasCota,
  latencia_ms: { p50: lat[Math.floor(lat.length / 2)] ?? 0, p95: lat[Math.floor(lat.length * 0.95)] ?? 0, max: lat.at(-1) ?? 0 },
  custo_total_usd: +custo.toFixed(4), custo_por_conversa_usd: +(custo / 1).toFixed(4),
  tokens_prompt: somaPrompt, tokens_cache: somaCache,
  acerto_cache: somaPrompt ? +(somaCache / somaPrompt).toFixed(4) : 0,
  retried: ok.filter((t) => t.retried).length,
  trocas_por_cota: trocasCota,
};
console.log("\n== resumo ==", JSON.stringify(resumo, null, 2));

await fs.mkdir("eval/out", { recursive: true });
await fs.writeFile(`eval/out/${TAG}.json`, JSON.stringify({ resumo, turnos }, null, 2));
