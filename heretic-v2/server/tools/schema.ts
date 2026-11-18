export const CATALOGO = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Busca na web. Devolve resultados ranqueados com título, URL e trecho.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, limit: { type: "integer", maximum: 20 } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_fetch",
      description: "Busca uma página como texto.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_image",
      description: "Gera uma imagem. Devolve a URL.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          negative: { type: "string" },
          aspect_ratio: { type: "string", enum: ["1:1", "3:2", "2:3", "16:9", "9:16"] },
        },
        required: ["prompt"],
      },
    },
  },
];

/** Instrução de formato vai no RESULTADO, não na descrição. */
export function draw(tool: string, args: any): string | null {
  if (tool === "web_search") {
    if (/mapa|lugar|endere|onde fica|perto/i.test(args.query ?? "")) return "são lugares: liste com o endereço, o mais perto primeiro";
    if (/pre[çc]o|custa|valor|n[uú]mero|estat[ií]stica/i.test(args.query ?? "")) return "são números: monte uma tabela, não um parágrafo corrido";
  }
  if (tool === "generate_image") return "mostre a imagem pelo markdown, sem descrever";
  return null;
}
