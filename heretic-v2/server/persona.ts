import base from "./prompts/base.md?raw";
import contract from "./prompts/contract.md?raw";
import tecnico from "./prompts/packs/tecnico.md?raw";
import osint from "./prompts/packs/osint.md?raw";
import criativo from "./prompts/packs/criativo.md?raw";
import roleplay from "./prompts/packs/roleplay.md?raw";
import estudo from "./prompts/packs/estudo.md?raw";
import shotTecnico from "./prompts/shots/tecnico.md?raw";
import shotOsint from "./prompts/shots/osint.md?raw";
import { est } from "./tokens";
import { SMALL_MODEL_HINTS } from "./models";
import type { Profile } from "./params";

const PACKS: Record<Profile, string> = { tecnico, osint, criativo, roleplay, estudo, prosa: "" };
const SHOTS: Partial<Record<Profile, string>> = { tecnico: shotTecnico, osint: shotOsint };

export function montar(profile: Profile, model: string) {
  const partes = [base, PACKS[profile]];
  if (SMALL_MODEL_HINTS.includes(model) && SHOTS[profile]) partes.push(SHOTS[profile]!);
  const text = partes.filter(Boolean).join("\n\n---\n\n");
  return { text, tokens: est(text) };
}

export const CONTRACT = contract;
export const CONTRACT_TOKENS = est(contract);

/** Texto byte-idêntico entre turnos: nada dinâmico aqui dentro. */
export function blocosSistema(profile: Profile, model: string, dataSistema: string) {
  return [
    { type: "text" as const, text: `${dataSistema}\n\n${montar(profile, model).text}`, cache_control: { type: "ephemeral" as const } },
  ];
}
