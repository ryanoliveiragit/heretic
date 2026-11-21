// Porteiro do 451 para os modelos locais (21/11).
// Fica na frente do gateway do Super Hacking (127.0.0.1:8000, que é dele: aqui só repassamos, sem mexer)
// e só deixa passar quem traz o segredo do site no cabeçalho x-451-local. Mantém também um túnel rápido da
// Cloudflare até esta porta e avisa o site (POST /api/local/registro) sempre que o endereço do túnel muda.
// Não grava conteúdo de pedido nem de resposta: o log tem só horário, modelo, situação e duração.
//
// Variáveis (todas opcionais): PORTA (8017), GATEWAY (http://127.0.0.1:8000), SITE (https://451sh.com),
// TOKEN_FILE (/home/ethical/.config/451-local/token), CLOUDFLARED, TUNEL=0 para não abrir túnel, LOG.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

const PORTA = Number(process.env.PORTA || 8017);
const GATEWAY = process.env.GATEWAY || 'http://127.0.0.1:8000';
const SITE = process.env.SITE || 'https://451sh.com';
const TOKEN = readFileSync(process.env.TOKEN_FILE || '/home/ethical/.config/451-local/token', 'utf8').trim();
const CLOUDFLARED = process.env.CLOUDFLARED || '/home/ethical/.local/bin/cloudflared';
const LOG = process.env.LOG || new URL('./porteiro.log', import.meta.url).pathname;
const TUNEL = process.env.TUNEL !== '0';
// Só os nomes que o gateway conhece (o resto nem chega lá).
const MODELOS = new Set(['local/qwen3-4b-abliterated', 'local/qwen3.6-35b-a3b-heretic', 'local/gemma-4-26b-a4b-heretic', 'local/gpt-oss-20b-heretic']);
const MAX_SAIDA = 2048;          // tokens de resposta por pedido (a função do site corta em ~300 s)
const MAX_CORPO = 512 * 1024;    // bytes do pedido

if (!/^[0-9a-f]{64}$/.test(TOKEN)) { console.error('segredo ausente ou inválido em TOKEN_FILE'); process.exit(1); }
const log = (...a) => { try { appendFileSync(LOG, `${new Date().toISOString()} ${a.join(' ')}\n`); } catch { /* sem log */ } };
const confere = (h) => { const a = Buffer.from(String(h || '')), b = Buffer.from(TOKEN); return a.length === b.length && timingSafeEqual(a, b); };
const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const srv = http.createServer(async (req, res) => {
  const caminho = new URL(req.url, 'http://x').pathname;
  if (req.method === 'GET' && caminho === '/saude') return json(res, 200, { ok: true });
  if (!confere(req.headers['x-451-local'])) return json(res, 401, { error: 'unauthorized' });
  if (req.method === 'GET' && caminho === '/fila') {
    try { const r = await fetch(`${GATEWAY}/fila`, { signal: AbortSignal.timeout(5000) }); return json(res, r.status, await r.json()); }
    catch (e) { return json(res, 502, { error: 'gateway', message: 'o gateway local não respondeu' }); }
  }
  if (req.method !== 'POST' || caminho !== '/v1/chat/completions') return json(res, 404, { error: 'not_found' });

  let tam = 0; const partes = [];
  for await (const c of req) { tam += c.length; if (tam > MAX_CORPO) return json(res, 413, { error: 'too_large' }); partes.push(c); }
  let corpo; try { corpo = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return json(res, 400, { error: 'json' }); }
  if (!MODELOS.has(corpo?.model)) return json(res, 400, { error: 'model' });
  corpo.max_tokens = Math.min(Number(corpo.max_tokens) || MAX_SAIDA, MAX_SAIDA);

  // Quem pediu desistiu (fechou a aba, o site cortou): cancela no gateway para liberar a vaga ou a fila.
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });
  const t0 = Date.now();
  try {
    const r = await fetch(`${GATEWAY}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: ac.signal });
    const cab = { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' };
    if (r.headers.get('x-fila')) cab['x-fila'] = r.headers.get('x-fila');
    res.writeHead(r.status, cab);
    if (r.body) for await (const c of r.body) res.write(c);
    res.end();
    log('pedido', corpo.model, r.status, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    log('falha', corpo.model, e.name, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (!res.headersSent) json(res, 502, { error: 'gateway', message: 'o modelo local não respondeu' }); else res.end();
  }
});
srv.listen(PORTA, '127.0.0.1', () => log('porteiro ouvindo em 127.0.0.1:' + PORTA));

// ── túnel + registro no site ──
let url = null, tentativa = 0, timer = null;
async function registra() {
  if (!url) return;
  clearTimeout(timer);
  try {
    const r = await fetch(`${SITE}/api/local/registro`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-451-local': TOKEN }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(15000) });
    log('registro no site', r.status);
    if (r.ok) { tentativa = 0; return; }
  } catch (e) { log('registro falhou', e.name); }
  tentativa += 1;
  timer = setTimeout(registra, Math.min(300000, 5000 * 2 ** Math.min(tentativa, 6)));
}
function tunel() {
  const p = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORTA}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const le = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== url) { url = m[0]; tentativa = 0; log('túnel aberto', url); setTimeout(registra, 4000); }
  };
  p.stdout.on('data', le); p.stderr.on('data', le);
  p.on('exit', (code) => { log('túnel fechou', code); url = null; setTimeout(tunel, 5000); });
}
if (TUNEL) {
  tunel();
  setInterval(registra, 10 * 60 * 1000); // de tempos em tempos, confirma o endereço no site
}
