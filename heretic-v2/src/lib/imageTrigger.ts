const OBJ = "imagem|imagens|foto|fotos|arte|desenho|ilustra\\w*|logo|logotipo|wallpaper|avatar|banner|p[ôo]ster|poster|capa|retrato|pintura|render";
const VERBO = "ger[ae]r?|cri[ae]r?|fa[çc]a|faz|desenh[ae]r?|ilustr[ae]r?|renderiz[ae]r?|mostr[ae]r?";

/** Só dispara com verbo imperativo. Substantivo solto não basta. */
export function ehPedidoDeImagem(texto: string): boolean {
  const t = texto.trim();
  if (t.length < 5 || t.length > 600) return false;
  if (/^\/(imagem|image|img)\b/i.test(t)) return true;
  return (
    new RegExp(`^\\s*(por favor,?\\s*)?(${VERBO})\\b[\\s\\S]{0,30}?\\b(${OBJ})\\b`, "i").test(t) ||
    new RegExp(`^\\s*(uma?\\s+)?(${OBJ})\\b\\s*(de|do|da|com|sobre)\\b[\\s\\S]{3,}`, "i").test(t)
  );
}

export function extrairPrompt(texto: string): string {
  const t = texto.replace(/^\/(imagem|image|img)\s*/i, "").trim();
  const m = t.match(new RegExp(`\\b(${OBJ})\\b\\s*(de|do|da|dos|das|com|:|que mostr\\w*|mostrando)?\\s*([\\s\\S]+)$`, "i"));
  return (m?.[3] ?? t).trim();
}
