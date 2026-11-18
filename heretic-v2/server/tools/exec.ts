import { vazio, falhou, cortar } from "./results";

const LIMITE_RESULTADO = 8192;

export async function executar(nome: string, args: any, signal: AbortSignal): Promise<string> {
  try {
    if (nome === "web_search") {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(args.query)}&count=${Math.min(args.limit ?? 10, 20)}`, {
        headers: { "X-Subscription-Token": process.env.SEARCH_KEY!, Accept: "application/json" },
        signal,
      });
      if (!r.ok) return falhou(`busca respondeu ${r.status}`);
      const j: any = await r.json();
      const items = (j.web?.results ?? []).map((x: any) => ({
        title: cortar(x.title ?? "", "title", 200),
        url: x.url,
        snippet: cortar(x.description ?? "", "snippet", 1200),
      }));
      if (!items.length) return vazio("web");
      return cortar(JSON.stringify({ found: true, results: items }), "results", LIMITE_RESULTADO);
    }

    if (nome === "web_fetch") {
      const r = await fetch(args.url, { signal, headers: { "User-Agent": "Mozilla/5.0 Heretic" } });
      if (!r.ok) return falhou(`página respondeu ${r.status}`);
      const html = await r.text();
      const texto = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!texto) return vazio("página");
      return cortar(JSON.stringify({ ok: true, url: args.url, text: texto }), "text", LIMITE_RESULTADO);
    }

    if (nome === "generate_image") {
      const r = await fetch(`${process.env.SELF_URL}/api/image`, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", "x-heretic-key": process.env.HERETIC_AUDIT! },
        body: JSON.stringify(args),
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) return falhou(j?.error?.code ?? "geração falhou");
      return JSON.stringify({ ok: true, url: j.url, revised_prompt: j.revised_prompt });
    }

    return falhou(`ferramenta ${nome} não existe`);
  } catch (e: any) {
    return falhou(e?.name === "AbortError" ? "cancelado" : (e?.message ?? "erro"));
  }
}
