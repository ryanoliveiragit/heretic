export async function* chamar(o: { model: string; messages: any[]; system: any; params: any; tools?: any[]; signal: AbortSignal }) {
  const { stop, frequency_penalty, presence_penalty, ...rest } = o.params;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: o.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: o.model,
      stream: true,
      system: o.system,
      messages: o.messages.filter((m) => m.role !== "system"),
      ...rest,
      stop_sequences: stop,
      ...(o.tools?.length ? { tools: o.tools } : {}),
    }),
  });
  if (!res.ok) throw Object.assign(new Error("anthropic"), { status: res.status });

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    const linhas = buf.split("\n");
    buf = linhas.pop() ?? "";
    for (const l of linhas) {
      if (!l.startsWith("data: ")) continue;
      let j: any;
      try { j = JSON.parse(l.slice(6)); } catch { continue; }
      if (j.type === "content_block_delta" && j.delta?.text) yield j.delta.text;
      if (j.type === "message_delta" && j.delta?.stop_reason) yield { stop: j.delta.stop_reason };
    }
  }
}
