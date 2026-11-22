// Ferramentas de segurança do 451 (CVE, pacote, IP, domínio, ASN, site, portas públicas). Runtime Node de propósito:
// o pacote resolve DNS e prende a conexão ao IP conferido contra SSRF, coisa que o Edge não faz. Só o servidor do 451
// chama esta rota (token interno em x-451-interno); o chat (Edge) junta os resultados com as fontes [n].
import { atende } from '../src/ferramentas/http.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let bruto = '';
  if (typeof req.body === 'string') bruto = req.body;
  else if (Buffer.isBuffer(req.body)) bruto = req.body.toString('utf8');
  else { for await (const parte of req) { bruto += parte; if (bruto.length > 64 * 1024) break; } }
  try { return JSON.parse(bruto || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'method_not_allowed' })); return; }
  const corpo = await lerCorpo(req);
  const { status, corpo: saida } = await atende(req.headers['x-451-interno'], corpo);
  res.statusCode = status;
  res.end(JSON.stringify(saida));
}
