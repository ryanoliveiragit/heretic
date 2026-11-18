const DIARIO = 20_000;
const EM_VOO = 4;

const cota = new Map<string, { dia: string; usado: number }>();
const voo = new Map<string, number>();

export function consumir(fp: string, tokens: number): { ok: boolean; restante: number } {
  const dia = new Date().toISOString().slice(0, 10);
  const atual = cota.get(fp);
  const reg = atual && atual.dia === dia ? atual : { dia, usado: 0 };
  if (reg.usado + tokens > DIARIO) return { ok: false, restante: Math.max(0, DIARIO - reg.usado) };
  reg.usado += tokens;
  cota.set(fp, reg);
  return { ok: true, restante: DIARIO - reg.usado };
}

export function entrar(fp: string): boolean {
  if ((voo.get(fp) ?? 0) >= EM_VOO) return false;
  voo.set(fp, (voo.get(fp) ?? 0) + 1);
  return true;
}

export function sair(fp: string) {
  voo.set(fp, Math.max(0, (voo.get(fp) ?? 1) - 1));
}
