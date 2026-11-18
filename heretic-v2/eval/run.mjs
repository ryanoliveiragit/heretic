import fs from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3000";
const TAG = process.argv[2] ?? "cand";
const N = Number(process.env.N ?? 1);
const casos = (await fs.readFile("eval/cases.jsonl", "utf8")).trim().split("\n").map(JSON.parse);

async function chamar(prompt, fp) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-heretic-client": fp },
    body: JSON.stringify({ text: prompt, history: [], conversationId: "eval" }),
  });
  const raw = await res.text();
  const evs = [...raw.matchAll(/^event: (\w+)\ndata: (.*)$/gm)].map((m) => [m[1], m[2]]);
  const erro = evs.find(([e]) => e === "error");
  const texto = evs.filter(([e]) => e === "token")
    .map(([, d]) => { try { return JSON.parse(d).t ?? ""; } catch { return ""; } }).join("");
  return { texto, erro: erro ? erro[1] : null };
}

async function julgar(prompt, resposta) {
  const res = await fetch(`${BASE}/api/judge`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, resposta }),
  });
  const j = await res.json().catch(() => ({}));
  return { nota: Number(j.nota) || 0, falhas: j.falhas ?? [] };
}

const out = [];
for (const c of casos) {
  for (let i = 0; i < N; i++) {
    const { texto: resposta, erro } = await chamar(c.p, `eval-${TAG}-${c.id}-${i}`);
    const j = await julgar(c.p, resposta);
    out.push({ id: c.id, cat: c.cat, nota: j.nota, falhas: j.falhas, resposta, erro });
    console.log(c.id, j.nota.toFixed(1), erro ? `ERRO ${erro}` : j.falhas.join(","));
    await new Promise((r) => setTimeout(r, 1200));
  }
}

const media = (a) => a.reduce((x, y) => x + y.nota, 0) / (a.length || 1);
const porCat = {};
for (const o of out) (porCat[o.cat] ??= []).push(o);
console.log(`\n== ${TAG} ==\ngeral: ${media(out).toFixed(2)}`);
for (const [k, v] of Object.entries(porCat)) console.log(`${k}: ${media(v).toFixed(2)}`);
const cont = {};
for (const o of out) for (const f of o.falhas) cont[f] = (cont[f] ?? 0) + 1;
console.log("falhas:", cont);

await fs.mkdir("eval/out", { recursive: true });
await fs.writeFile(`eval/out/${TAG}.json`, JSON.stringify({
  tag: TAG, media: media(out),
  porCat: Object.fromEntries(Object.entries(porCat).map(([k, v]) => [k, media(v)])), cont, out,
}, null, 2));
