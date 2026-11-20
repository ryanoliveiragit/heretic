// Gera uma chave Pro assinada (1 dia) sem pagamento, usando o mesmo algoritmo do servidor (plans.js).
// Valida em seguida contra a produção (deve virar tier pro em /api/me).
import { readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync('/tmp/opencode/451.env', 'utf8');
const m = env.match(/^ACCESS_SECRET\s*=\s*["']?([^\n"']+)["']?/m);
if (!m) { console.error('ACCESS_SECRET nao encontrado em /tmp/opencode/451.env'); process.exit(1); }
const ACCESS_SECRET = m[1].trim();

function paidSig(payload) {
  const salts = ['A9', 'C7', 'E3', 'B5'];
  let out = '';
  for (const salt of salts) {
    let h = 0x811c9dc5 >>> 0;
    const s = `${ACCESS_SECRET}|${salt}|${payload}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    out += h.toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padStart(4, '0');
  }
  return out;
}

const expiresAt = Date.now() + 24 * 3600 * 1000;
const expSec = Math.floor(expiresAt / 1000).toString(36).toUpperCase();
const key = `451-PRO-${expSec}-${paidSig(`PRO|${expSec}`)}`;
writeFileSync(new URL('./pro.key', import.meta.url), key + '\n');

const r = await fetch('https://451sh.com/api/me', { headers: { 'x-451-key': key } });
const j = await r.json().catch(() => ({}));
console.log(JSON.stringify({ ok: r.status === 200, status: r.status, plan: j.plan, tier: j.tier, expires: new Date(expiresAt).toISOString(), key: key.slice(0, 12) + '...' }, null, 1));
