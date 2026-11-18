export const MODELS = {
  work: "venice:z-ai-glm-5-3-flash",
  prose: "cognitivecomputations/dolphin-mistral-24b-venice-edition",
  creative: "venice:venice-uncensored-role-play",
  study: "venice:gemma-4-uncensored",
  heavy: "venice:zai-org-glm-5-2",
  top: "claude-opus-5-5",
} as const;

export const CTX_REAL: Record<string, number> = {
  "venice:z-ai-glm-5-3-flash": 1_000_000,
  "cognitivecomputations/dolphin-mistral-24b-venice-edition": 128_000,
  "venice:venice-uncensored-role-play": 128_000,
  "venice:gemma-4-uncensored": 256_000,
  "venice:zai-org-glm-5-2": 1_000_000,
  "claude-opus-5-5": 200_000,
};

export const SMALL_MODEL_HINTS = [
  "cognitivecomputations/dolphin-mistral-24b-venice-edition",
  "venice:gemma-4-uncensored",
];

export const PRICE: Record<string, { in: number; out: number }> = {
  "venice:z-ai-glm-5-3-flash": { in: 0.15, out: 0.5 },
  "cognitivecomputations/dolphin-mistral-24b-venice-edition": { in: 0.2, out: 0.9 },
  "venice:venice-uncensored-role-play": { in: 0.5, out: 2 },
  "venice:gemma-4-uncensored": { in: 0.16, out: 0.5 },
  "venice:zai-org-glm-5-2": { in: 1.4, out: 4.4 },
  "claude-opus-5-5": { in: 5, out: 25 },
};

export const REASONING = [
  "venice:zai-org-glm-5-2",
  "venice:deepseek-v4-1-flash-uncensored",
];

/** Teto publicado é sempre menor que o real. */
export const ctxPublicado = (model: string) => (CTX_REAL[model] ?? 128_000) - 8192;
