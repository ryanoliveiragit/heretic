/**
 * A única regra de conteúdo do produto. Lê o prompt e NÃO o negativo:
 * termo no negativo é instrução de excluir, casar ali dispararia no uso responsável.
 */
const SINAIS = [
  /(loli|lolita|child|crian[çc]a|menina|garota|garoto|menino|shota|infantil)/i,
  /(nsfw|nude|nua|nu\b|er[oó]tic|sensual|b[íi]kini|lingerie|sem roupa)/i,
];

export function ehSuspeito(prompt: string): boolean {
  return SINAIS.filter((r) => r.test(prompt)).length >= 2;
}

export function revisar(prompt: string): string | null {
  if (!ehSuspeito(prompt)) return null;
  if (/(adult|18|adulta|adulto)/i.test(prompt)) return null;
  return "Regra única do produto: se houver menor em cena sexual, diga a idade adulta no prompt.";
}

const ASPECTOS: Record<string, [number, number]> = {
  "1:1": [1024, 1024], "3:2": [1216, 832], "2:3": [832, 1216], "16:9": [1344, 768], "9:16": [768, 1344],
};

export const dimensoes = (a: string) => ASPECTOS[a] ?? ASPECTOS["1:1"];
