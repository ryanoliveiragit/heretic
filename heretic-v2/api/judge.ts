import judge from "../server/prompts/judge.md?raw";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("no", { status: 405 });
  const { prompt, resposta } = await req.json();

  const res = await fetch("https://api.venice.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VENICE_KEY}` },
    body: JSON.stringify({
      model: "z-ai-glm-5-3-flash",
      temperature: 0,
      max_tokens: 300,
      messages: [
        { role: "system", content: judge },
        { role: "user", content: `PROMPT:\n${prompt}\n\nRESPOSTA:\n${resposta}` },
      ],
    }),
  });
  const j: any = await res.json();
  const txt: string = j.choices?.[0]?.message?.content ?? "{}";
  let out = { nota: 0, falhas: ["parse"], comentario: "" };
  try { out = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); } catch {}
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
}
