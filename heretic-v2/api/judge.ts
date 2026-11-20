import judge from "../server/prompts/judge.md?raw";

export const config = { runtime: "edge" };

/**
 * O juiz roda na Venice e cai para o OpenRouter quando a Venice recusa por saldo
 * (402): sem fallback, qualquer aperto de crédito virava nota 0 com judge_vazio.
 */
const BACKENDS = process.env.HERETIC_EVAL_OR === "1"
  ? [{ url: "https://openrouter.ai/api/v1/chat/completions", model: "z-ai/glm-5.3-flash", key: () => process.env.OPENROUTER_KEY, extra: { "HTTP-Referer": process.env.SELF_URL ?? "", "X-Title": "Heretic" } }]
  : [
      { url: "https://api.venice.ai/api/v1/chat/completions", model: "z-ai-glm-5-3-flash", key: () => process.env.VENICE_KEY },
      { url: "https://openrouter.ai/api/v1/chat/completions", model: "z-ai/glm-5.3-flash", key: () => process.env.OPENROUTER_KEY, extra: { "HTTP-Referer": process.env.SELF_URL ?? "", "X-Title": "Heretic" } },
    ];

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("no", { status: 405 });
  const { prompt, resposta, busca } = await req.json();
  const contexto = busca ? `PROMPT (busca: sim, houve resultado de busca no contexto):\n${prompt}` : `PROMPT:\n${prompt}`;
  const corpo = {
    temperature: 0,
    max_tokens: 800,
    messages: [
      { role: "system", content: judge },
      { role: "user", content: `${contexto}\n\nRESPOSTA:\n${String(resposta ?? "").slice(0, 8000)}` },
    ],
  };

  // O corpo pode voltar vazio ou truncado; sem o laço, {} virava nota 0 silenciosa.
  let ultimoErro = "";
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const b = BACKENDS[Math.min(Math.floor(tentativa / 3), BACKENDS.length - 1)];
    if (!b.key()) { ultimoErro = "sem chave"; continue; }
    if (tentativa % 3) await new Promise((r) => setTimeout(r, 800 * 2 ** (tentativa % 3)));

    const res = await fetch(b.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${b.key()}`, ...(b.extra ?? {}) },
      body: JSON.stringify({ model: b.model, ...corpo }),
    }).catch((e) => { ultimoErro = String(e?.message ?? e); return null; });
    if (!res) continue;
    if (!res.ok) { ultimoErro = `${res.status} ${b.model}`; continue; }

    const j: any = await res.json().catch(() => ({}));
    const txt: string = j.choices?.[0]?.message?.content ?? "";
    try {
      const out = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      if (typeof out?.nota === "number") {
        return new Response(JSON.stringify({ ...out, falhas: out.falhas ?? [], juiz: b.model }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      ultimoErro = `json sem nota: ${txt.slice(0, 60)}`;
    } catch { ultimoErro = `json ilegivel: ${txt.slice(0, 60)}`; }
  }
  return new Response(JSON.stringify({ nota: 0, falhas: ["judge_vazio"], comentario: `juiz não devolveu JSON legível (${ultimoErro.slice(0, 80)})` }), { headers: { "Content-Type": "application/json" } });
}
