import judge from "../server/prompts/judge.md?raw";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("no", { status: 405 });
  const { prompt, resposta } = await req.json();

  // O corpo pode voltar vazio ou truncado; sem o laço, {} virava nota 0 silenciosa.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    if (tentativa) await new Promise((r) => setTimeout(r, 700 * 2 ** tentativa));
    const res = await fetch("https://api.venice.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VENICE_KEY}` },
      body: JSON.stringify({
        model: "z-ai-glm-5-3-flash",
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: "system", content: judge },
          { role: "user", content: `PROMPT:\n${prompt}\n\nRESPOSTA:\n${String(resposta ?? "").slice(0, 8000)}` },
        ],
      }),
    });
    const j: any = await res.json().catch(() => ({}));
    const txt: string = j.choices?.[0]?.message?.content ?? "";
    try {
      const out = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      if (typeof out?.nota === "number") {
        return new Response(JSON.stringify({ ...out, falhas: out.falhas ?? [] }), { headers: { "Content-Type": "application/json" } });
      }
    } catch {}
  }
  return new Response(JSON.stringify({ nota: 0, falhas: ["judge_vazio"], comentario: "juiz não devolveu JSON legível" }), { headers: { "Content-Type": "application/json" } });
}
