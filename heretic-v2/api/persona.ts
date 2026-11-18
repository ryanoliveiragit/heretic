import { montar, CONTRACT } from "../server/persona";
import { est } from "../server/tokens";

export default async function handler(req: Request) {
  if (req.headers.get("x-heretic-key") !== process.env.HERETIC_AUDIT) return new Response("no", { status: 401 });
  const q = new URL(req.url).searchParams;
  const p = (q.get("p") ?? "prosa") as any;
  const m = q.get("m") ?? "prosa";
  const a = montar(p, m);
  return new Response(JSON.stringify({
    profile: p, model: m, personaTokens: a.tokens, contractTokens: est(CONTRACT),
    total: a.tokens + est(CONTRACT), text: `${a.text}\n\n---\n\n${CONTRACT}`,
  }), { headers: { "Content-Type": "application/json" } });
}
