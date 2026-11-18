export type Profile = "tecnico" | "osint" | "criativo" | "roleplay" | "estudo" | "prosa";

const TETO: Record<string, number> = { "claude-opus-5-5": 16384, default: 8192 };

export const PROFILES: Record<Profile, {
  temperature: number; top_p: number; frequency_penalty: number; presence_penalty: number;
}> = {
  tecnico: { temperature: 0.3, top_p: 0.95, frequency_penalty: 0.3, presence_penalty: 0.1 },
  osint: { temperature: 0.25, top_p: 0.9, frequency_penalty: 0.2, presence_penalty: 0.1 },
  estudo: { temperature: 0.4, top_p: 0.95, frequency_penalty: 0.3, presence_penalty: 0.15 },
  prosa: { temperature: 0.65, top_p: 0.95, frequency_penalty: 0.35, presence_penalty: 0.2 },
  criativo: { temperature: 0.9, top_p: 0.98, frequency_penalty: 0.5, presence_penalty: 0.35 },
  roleplay: { temperature: 0.95, top_p: 0.98, frequency_penalty: 0.45, presence_penalty: 0.4 },
};

export const STOPS = ["\n\nUsuário:", "\n\nUser:", "<|im_end|>", "<|eot_id|>"];

export function buildParams(p: Profile, model: string, quality: boolean, raciocina: boolean) {
  const b = PROFILES[p];
  const out: Record<string, unknown> = {
    ...b,
    ...(quality ? { temperature: Math.min(b.temperature, 0.5) } : {}),
    stop: STOPS,
  };
  // turno que raciocina descarta max_tokens: o teto cobriria raciocínio + resposta
  if (!raciocina) out.max_tokens = TETO[model] ?? TETO.default;
  return out;
}
