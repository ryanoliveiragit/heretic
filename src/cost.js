import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE_PATH = join(__dirname, '..', 'data', 'usage.jsonl');

// Preços por provedor (USD por 1M tokens)
const PRICES = {
  openrouter: { input: 0, output: 0 }, // free
  venice: { input: 0.5, output: 1.5 },
};

export async function logUsage({ provider, mode, model, tokensIn, tokensOut, durationMs }) {
  const price = PRICES[provider] || { input: 0, output: 0 };
  const usd = (tokensIn / 1_000_000) * price.input + (tokensOut / 1_000_000) * price.output;
  const entry = {
    ts: new Date().toISOString(),
    provider, mode, model,
    tokens_in: tokensIn, tokens_out: tokensOut,
    usd: Math.round(usd * 1e6) / 1e6,
    duration_ms: durationMs,
  };
  await appendFile(USAGE_PATH, JSON.stringify(entry) + '\n');
  return entry;
}

export async function getTotalsByProvider() {
  // leitura simplificada — em produção, parse do jsonl
  return { openrouter: { requests: 0, usd: 0 }, venice: { requests: 0, usd: 0 } };
}
