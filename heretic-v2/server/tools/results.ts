import { hoje } from "../date";

export const vazio = (corpus: string) =>
  JSON.stringify({ found: false, note: `consultado ${corpus} em ${hoje()}, nada corresponde` });

export const falhou = (motivo: string) => JSON.stringify({ ok: false, error: motivo });

export function cortar(s: string, campo: string, lim = 8192): string {
  if (s.length <= lim) return s;
  return `${s.slice(0, lim)}\n[…${campo} cortado em ${lim} de ${s.length} caracteres]`;
}
