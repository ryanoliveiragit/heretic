import { erro, ok } from "../server/errors";
import { dimensoes, revisar } from "../server/images";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method !== "POST") return erro("invalid_request", "Use POST.");
  const body: any = await req.json().catch(() => ({}));
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return erro("invalid_request", "Sem prompt.");

  const aviso = revisar(prompt);
  const [w, h] = dimensoes(body.aspect_ratio ?? "1:1");

  const res = await fetch("https://api.venice.ai/api/v1/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VENICE_KEY}` },
    body: JSON.stringify({
      model: "venice-sd35",
      prompt: aviso ? `${prompt}, ${aviso}` : prompt,
      negative_prompt: body.negative ?? "",
      width: w, height: h, steps: 30, format: "png",
    }),
  });
  if (!res.ok) return erro("upstream_unavailable", "A imagem não saiu. Tente de novo.");

  const j: any = await res.json();
  const b64 = j.images?.[0];
  if (!b64) return erro("upstream_unavailable", "A imagem não saiu.");

  return ok({
    url: `data:image/png;base64,${b64}`,
    revised_prompt: prompt,
    size: `${w}x${h}`,
    negative: body.negative ?? "",
  });
}
