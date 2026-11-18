import { CTX_REAL, MODELS, REASONING, ctxPublicado } from "../server/models";

export default async function handler() {
  const lista = Object.values(MODELS).map((id) => ({
    id,
    object: "model",
    context_length: ctxPublicado(id),
    max_model_len: ctxPublicado(id),
    context_real: CTX_REAL[id] ?? 128_000,
    attachment: true,
    tool_call: !id.startsWith("cognitivecomputations") && !id.startsWith("claude"),
    reasoning: REASONING.includes(id),
  }));
  return new Response(JSON.stringify({ object: "list", data: lista }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}
