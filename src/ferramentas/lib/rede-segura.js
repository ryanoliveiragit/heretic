// Acesso a páginas públicas com proteção contra SSRF:
// - só http/https nas portas 80 e 443
// - resolve o nome antes e recusa IP privado, de loopback, link-local, metadados de nuvem, CGNAT, multicast e reservados
// - a conexão é presa ao IP conferido (nada de DNS rebinding) e cada redirecionamento é conferido de novo
// - sem cookies, até 5 redirecionamentos, tamanho e tempo limitados
import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { UA, ErroFerramenta } from './comum.js';

const BLOQUEIOS_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
function v4ParaNum(ip) { return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0; }
function v4Bloqueado(ip) {
  const n = v4ParaNum(ip);
  return BLOQUEIOS_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ParaNum(base) & mask);
  });
}
function v6Bloqueado(ip) {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return true;
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4 mapeado
  if (m) return v4Bloqueado(m[1]);
  return /^(fc|fd)/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith('2001:db8') || s.startsWith('64:ff9b');
}
export function ipBloqueado(ip) {
  const v = net.isIP(ip);
  if (v === 4) return v4Bloqueado(ip);
  if (v === 6) return v6Bloqueado(ip);
  return true;
}

export async function conferirDestino(urlTexto) {
  let u;
  try { u = new URL(urlTexto); } catch { throw new ErroFerramenta('endereço inválido', 'entrada'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ErroFerramenta('só http e https', 'bloqueado');
  const porta = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (![80, 443].includes(porta)) throw new ErroFerramenta('só as portas 80 e 443', 'bloqueado');
  if (u.username || u.password) throw new ErroFerramenta('endereço com usuário e senha não é aceito', 'bloqueado');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.onion)$/i.test(host)) throw new ErroFerramenta('endereço interno ou .onion bloqueado', 'bloqueado');
  let ips;
  if (net.isIP(host)) ips = [{ address: host, family: net.isIP(host) }];
  else {
    try { ips = await dns.lookup(host, { all: true, verbatim: true }); }
    catch { throw new ErroFerramenta(`o domínio ${host} não resolve`, 'dns'); }
  }
  const ruins = ips.filter((i) => ipBloqueado(i.address));
  if (!ips.length || ruins.length) throw new ErroFerramenta('o endereço aponta para rede privada ou reservada', 'bloqueado');
  return { url: u, host, porta, ip: ips[0].address, familia: ips[0].family };
}

function pedido(dest, { metodo = 'GET', timeoutMs, maxBytes, accept }) {
  return new Promise((resolve, reject) => {
    const mod = dest.url.protocol === 'https:' ? https : http;
    const req = mod.request({
      method: metodo,
      host: dest.host,
      port: dest.porta,
      path: dest.url.pathname + dest.url.search,
      servername: net.isIP(dest.host) ? undefined : dest.host,
      lookup: (_h, opts, cb) => (opts && opts.all ? cb(null, [{ address: dest.ip, family: dest.familia }]) : cb(null, dest.ip, dest.familia)),
      headers: { 'user-agent': UA, accept: accept || 'text/html,application/xhtml+xml,application/json,text/plain,application/xml;q=0.9,*/*;q=0.5', 'accept-encoding': 'identity' },
      timeout: timeoutMs,
    }, (res) => {
      // o certificado precisa ser lido antes de a conexão fechar
      let cert = null;
      try { cert = res.socket && typeof res.socket.getPeerCertificate === 'function' ? res.socket.getPeerCertificate() : null; } catch { cert = null; }
      const partes = []; let total = 0; let cortado = false;
      res.on('data', (c) => {
        total += c.length;
        if (total > maxBytes) { cortado = true; partes.push(c.subarray(0, Math.max(0, c.length - (total - maxBytes)))); res.destroy(); return; }
        partes.push(c);
      });
      const fim = () => resolve({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes), cortado, tls: cert && Object.keys(cert).length ? cert : null });
      res.on('end', fim); res.on('close', fim);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new ErroFerramenta(`sem resposta em ${timeoutMs / 1000} s`, 'tempo_esgotado')));
    req.on('error', reject);
    req.end();
  });
}

// Busca uma URL pública seguindo até 5 redirecionamentos, conferindo cada destino
export async function buscarSeguro(urlTexto, { metodo = 'GET', timeoutMs = 15000, maxBytes = 10 * 1024 * 1024, accept } = {}) {
  let atual = urlTexto; const cadeia = [];
  for (let i = 0; i <= 5; i++) {
    const dest = await conferirDestino(atual);
    const r = await pedido(dest, { metodo, timeoutMs, maxBytes, accept });
    cadeia.push({ url: dest.url.href, status: r.status, ip: dest.ip });
    if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.location) {
      atual = new URL(r.headers.location, dest.url).href;
      continue;
    }
    return { ...r, urlFinal: dest.url.href, ip: dest.ip, cadeia };
  }
  throw new ErroFerramenta('redirecionamentos demais', 'bloqueado');
}

// robots.txt simples: respeita "Disallow" do grupo "User-agent: *"
export async function robotsPermite(urlTexto) {
  try {
    const u = new URL(urlTexto);
    const r = await buscarSeguro(`${u.protocol}//${u.host}/robots.txt`, { timeoutMs: 6000, maxBytes: 256 * 1024, accept: 'text/plain' });
    if (r.status !== 200) return true;
    let ativo = false; const proibidos = [];
    for (const linha of r.corpo.toString('utf8').split(/\r?\n/)) {
      const [k, ...v] = linha.split(':'); const chave = (k || '').trim().toLowerCase(); const valor = v.join(':').trim();
      if (chave === 'user-agent') ativo = valor === '*';
      else if (ativo && chave === 'disallow' && valor) proibidos.push(valor);
    }
    return !proibidos.some((p) => u.pathname.startsWith(p));
  } catch { return true; }
}

// HTML para texto legível
export function htmlParaTexto(html) {
  const titulo = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  let s = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  s = s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ent[e.toLowerCase()] ?? m;
  });
  s = s.replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return { titulo: titulo.replace(/\s+/g, ' ').trim(), texto: s };
}
