import { streamOpenAI } from "./sse";

export async function* chamar(o: { model: string; messages: any[]; system: any; params: any; tools?: any[]; signal: AbortSignal }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: o.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
      "HTTP-Referer": process.env.SELF_URL ?? "",
      "X-Title": "Heretic",
    },
    body: JSON.stringify({
      model: o.model,
      stream: true,
      messages: [{ role: "system", content: o.system }, ...o.messages],
      ...o.params,
      ...(o.tools?.length ? { tools: o.tools } : {}),
      usage: { include: true },
    }),
  });
  if (!res.ok) throw Object.assign(new Error("openrouter"), { status: res.status });
  yield* streamOpenAI(res);
}
