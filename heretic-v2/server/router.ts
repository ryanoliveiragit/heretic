import { MODELS } from "./models";
import type { Profile } from "./params";

export type Route = { profile: Profile; model: string; search: boolean };

const RULES: [RegExp, Profile, string, boolean][] = [
  [/^(pesquis\w*|investig\w*|quem (é|e|são|sao)|ficha|osint|dossi[eê]|dossie|perfil de)/i, "osint", MODELS.work, true],
  [/(roleplay|\brp\b|interpreta (o|a|um|uma)|finja que|você é o|voce e o)/i, "roleplay", MODELS.creative, false],
  [/(erro|traceback|stack ?trace|exception|compil\w*|sql|regex|deploy|docker|kubernetes|nmap|curl|ssh|python|typescript|javascript|bash|api|endpoint|vulnerab|exploit|xss|sqli|csrf|firewall|kernel|bin[aá]rio|pentest|enumera\w*)/i, "tecnico", MODELS.work, false],
  [/(escreva|conto|poema|roteiro|hist[oó]ria|cr[oô]nica|letra de|narr\w*)/i, "criativo", MODELS.creative, false],
  [/(me ensina|explica (do zero|passo)|como funciona|o que é|aprende|estudar|prova|concurso)/i, "estudo", MODELS.study, false],
];

export function route(text: string): Route {
  const t = text.trim();
  for (const [re, profile, model, search] of RULES) if (re.test(t)) return { profile, model, search };
  return { profile: "prosa", model: MODELS.prose, search: false };
}
