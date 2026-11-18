export async function* streamOpenAI(res: Response) {
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
      const dados = l.slice(6).trim();
      if (dados === "[DONE]") return;
      let j: any;
      try { j = JSON.parse(dados); } catch { continue; }
      const c = j.choices?.[0];
      if (c?.delta?.content) yield c.delta.content;
      if (c?.delta?.tool_calls?.length) yield { toolCalls: c.delta.tool_calls };
      if (c?.finish_reason) yield { stop: c.finish_reason };
      if (j.usage) yield { usage: j.usage };
    }
  }
}
