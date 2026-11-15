// Cost tracking — no-op on serverless (no file system on Edge).
// In-memory counters for the current warm instance.

let _entries = [];

export async function logUsage({ provider, mode, model, tokensIn, tokensOut, durationMs }) {
  const entry = {
    ts: new Date().toISOString(),
    provider, mode, model,
    tokens_in: tokensIn, tokens_out: tokensOut,
    duration_ms: durationMs,
  };
  _entries.push(entry);
  return entry;
}

export async function getTotalsByProvider() {
  return { openrouter: { requests: 0, usd: 0 }, venice: { requests: 0, usd: 0 } };
}
