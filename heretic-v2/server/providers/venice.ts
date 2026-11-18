import { streamOpenAI } from "./sse";

export async function* chamar(o: { model: string; messages: any[]; system: any; params: any; tools?: any[]; signal: AbortSignal }) {
  const model = o.model.replace(/^venice:/, "");
  const res = await fetch("https://api.venice.ai/api/v1/chat/completions", {
    method: "POST",
    signal: o.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VENICE_KEY}` },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: "system", content: o.system }, ...o.messages],
      ...o.params,
      ...(o.tools?.length ? { tools: o.tools } : {}),
      venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
    }),
  });
  if (!res.ok) throw Object.assign(new Error("venice"), { status: res.status });
  yield* streamOpenAI(res);
}
