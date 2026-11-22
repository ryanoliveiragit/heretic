// Inteligência de rede passiva: dono de IP e domínio (RDAP), ASN (RIPEstat), DNS, certificados públicos (crt.sh),
// portas vistas por varreduras públicas (Shodan InternetDB) e uma visita única a um site (cabeçalhos e TLS).
// O 451 não varre portas nem faz tráfego ativo contra o alvo além de uma visita normal de página.
import dns from 'node:dns/promises';
import net from 'node:net';
import { buscarJson, doCache, fontes, resultado, texto, ErroFerramenta } from '../lib/comum.js';
import { buscarSeguro, ipBloqueado, htmlParaTexto } from '../lib/rede-segura.js';

const RIPE = 'https://stat.ripe.net/data';

function nomesEntidades(ents = []) {
  const out = [];
  for (const e of ents) {
    const fn = (e.vcardArray?.[1] || []).find((x) => x[0] === 'fn')?.[3];
    if (fn) out.push({ nome: fn, papel: (e.roles || []).join(', ') });
    if (e.entities) out.push(...nomesEntidades(e.entities));
  }
  return out.slice(0, 8);
}
function eventos(evs = []) { return Object.fromEntries(evs.map((e) => [e.eventAction, e.eventDate?.slice(0, 10)])); }

function conferirIp(ip) {
  const s = String(ip || '').trim();
  if (!net.isIP(s)) throw new ErroFerramenta('IP inválido', 'entrada');
  if (ipBloqueado(s)) throw new ErroFerramenta('IP privado ou reservado: não há dado público sobre ele', 'entrada');
  return s;
}
function conferirDominio(d) {
  const s = String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s)) throw new ErroFerramenta('domínio inválido', 'entrada');
  if (/\.(local|internal|onion)$/.test(s)) throw new ErroFerramenta('domínio interno ou .onion não é aceito', 'entrada');
  return s;
}

async function internetdb(ip) {
  return doCache('idb:' + ip, 3600e3, () => buscarJson(`https://internetdb.shodan.io/${ip}`, { timeoutMs: 12000 }).catch(() => null));
}

export const tools = {
  ip_info: {
    name: 'ip_info',
    description: 'Dados públicos de um IP: dono e faixa (RDAP), país, ASN e operadora, DNS reverso e portas e serviços vistos por varreduras públicas (Shodan InternetDB). Não envia nenhum pacote ao IP.',
    schema: { type: 'object', properties: { ip: { type: 'string' } }, required: ['ip'] },
    run: async ({ ip }) => {
      const alvo = conferirIp(ip);
      const { lista, cite } = fontes();
      const [rdap, pref, rev, idb] = await Promise.all([
        buscarJson(`https://rdap.org/ip/${alvo}`, { timeoutMs: 15000 }).catch(() => null),
        buscarJson(`${RIPE}/prefix-overview/data.json?resource=${alvo}`, { timeoutMs: 15000 }).catch(() => null),
        dns.reverse(alvo).catch(() => []),
        internetdb(alvo),
      ]);
      const dados = {
        ip: alvo,
        dono: rdap ? { nome: rdap.name, handle: rdap.handle, pais: rdap.country, faixa: rdap.startAddress && `${rdap.startAddress} – ${rdap.endAddress}`, entidades: nomesEntidades(rdap.entities), fonte: cite(`RDAP de ${alvo}`, `https://rdap.org/ip/${alvo}`) } : null,
        asn: pref?.data?.asns?.length ? { prefixo: pref.data.resource, asns: pref.data.asns.map((a) => ({ asn: a.asn, dono: a.holder })), fonte: cite(`RIPEstat ${alvo}`, `https://stat.ripe.net/${alvo}`) } : null,
        dns_reverso: rev.slice(0, 5),
        portas_publicas: idb ? { portas: idb.ports, nomes: (idb.hostnames || []).slice(0, 10), cpes: (idb.cpes || []).slice(0, 10), tags: idb.tags, cves: (idb.vulns || []).slice(0, 15), fonte: cite(`Shodan InternetDB ${alvo}`, `https://internetdb.shodan.io/${alvo}`) } : { portas: [], fonte: null },
      };
      const asn = dados.asn?.asns?.[0];
      return resultado(`${alvo}${dados.dono?.nome ? ` · ${dados.dono.nome}` : ''}${dados.dono?.pais ? ` (${dados.dono.pais})` : ''}${asn ? ` · AS${asn.asn} ${asn.dono}` : ''}${idb?.ports?.length ? ` · portas vistas publicamente: ${idb.ports.join(', ')}` : ''}.`, dados, lista,
        ['As portas vêm de varreduras públicas (Shodan) e podem estar desatualizadas; o 451 não testou nenhuma porta.']);
    },
  },

  dominio_info: {
    name: 'dominio_info',
    description: 'Dados públicos de um domínio: registros DNS (A, AAAA, MX, NS, TXT, CAA, SOA), registro no RDAP (registrador, datas, status, servidores de nome) e subdomínios vistos em certificados públicos (crt.sh).',
    schema: { type: 'object', properties: { dominio: { type: 'string' }, subdominios: { type: 'boolean', description: 'buscar subdomínios no crt.sh (padrão true)' } }, required: ['dominio'] },
    run: async ({ dominio, subdominios = true }) => {
      const d = conferirDominio(dominio);
      const { lista, cite } = fontes();
      const tipos = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CAA', 'SOA'];
      const regs = {};
      await Promise.all(tipos.map(async (t) => {
        try {
          const v = await dns.resolve(d, t);
          regs[t] = t === 'TXT' ? v.map((x) => texto(x.join(''), 300)).slice(0, 15) : (Array.isArray(v) ? v.slice(0, 15) : v);
        } catch { /* sem registro */ }
      }));
      const [rdap, crt] = await Promise.all([
        buscarJson(`https://rdap.org/domain/${d}`, { timeoutMs: 15000 }).catch(() => null),
        subdominios ? doCache('crt:' + d, 6 * 3600e3, () => buscarJson(`https://crt.sh/?q=${encodeURIComponent('%.' + d)}&output=json`, { timeoutMs: 25000 })).catch(() => null) : null,
      ]);
      const subs = crt ? [...new Set(crt.flatMap((c) => String(c.name_value || '').split('\n')).map((s) => s.trim().toLowerCase().replace(/^\*\./, '')).filter((s) => s.endsWith('.' + d) || s === d))].sort() : null;
      const tiposAchados = Object.keys(regs).length;
      const dados = {
        dominio: d,
        // o DNS tem fonte própria: sem ela o modelo atribuía os registros ao RDAP
        dns: tiposAchados ? { ...regs, fonte: cite(`Registros DNS de ${d}`, `https://dns.google/query?name=${encodeURIComponent(d)}`, 'resolvedor DNS') } : {},
        registro: rdap ? { registrador: nomesEntidades(rdap.entities).find((e) => /registrar/.test(e.papel))?.nome || null, datas: eventos(rdap.events), status: rdap.status, servidores: (rdap.nameservers || []).map((n) => n.ldhName?.toLowerCase()), fonte: cite(`RDAP de ${d}`, `https://rdap.org/domain/${d}`) } : null,
        subdominios: subs ? { total: subs.length, lista: subs.slice(0, 150), fonte: cite(`Certificados de ${d} · crt.sh`, `https://crt.sh/?q=${encodeURIComponent('%.' + d)}`) } : null,
      };
      const lim = [];
      if (subdominios && !crt) lim.push('O crt.sh não respondeu: subdomínios ausentes nesta consulta.');
      if (subs && subs.length > 150) lim.push(`Mostrando 150 de ${subs.length} subdomínios.`);
      if (!rdap) lim.push('O RDAP do domínio não respondeu ou o registro não publica RDAP.');
      if (tiposAchados) lim.push('Os registros DNS vêm do resolvedor do servidor do 451; o link da fonte abre a mesma consulta no Google Public DNS para conferir.');
      return resultado(`${d}: ${tiposAchados} tipos de registro DNS${dados.registro?.datas?.registration ? `, registrado em ${dados.registro.datas.registration}` : ''}${subs ? `, ${subs.length} subdomínio(s) em certificados públicos` : ''}.`, dados, lista, lim);
    },
  },

  asn_info: {
    name: 'asn_info',
    description: 'Dados públicos de um sistema autônomo (ASN): dono, se está anunciado e as faixas de IP anunciadas (RIPEstat).',
    schema: { type: 'object', properties: { asn: { type: 'string', description: 'ex.: AS13335 ou 13335' } }, required: ['asn'] },
    run: async ({ asn }) => {
      const n = String(asn || '').toUpperCase().replace(/^AS/, '').trim();
      if (!/^\d{1,10}$/.test(n)) throw new ErroFerramenta('ASN inválido', 'entrada');
      const { lista, cite } = fontes();
      const [ov, pf] = await Promise.all([
        buscarJson(`${RIPE}/as-overview/data.json?resource=AS${n}`, { timeoutMs: 15000 }).catch(() => null),
        buscarJson(`${RIPE}/announced-prefixes/data.json?resource=AS${n}`, { timeoutMs: 20000 }).catch(() => null),
      ]);
      if (!ov?.data) throw new ErroFerramenta('o RIPEstat não respondeu', 'fonte_indisponivel');
      const prefixos = (pf?.data?.prefixes || []).map((p) => p.prefix);
      const dados = { asn: `AS${n}`, dono: ov.data.holder, anunciado: ov.data.announced, prefixos: { total: prefixos.length, v4: prefixos.filter((p) => p.includes('.')).length, v6: prefixos.filter((p) => p.includes(':')).length, amostra: prefixos.slice(0, 40) }, fonte: cite(`AS${n} · RIPEstat`, `https://stat.ripe.net/AS${n}`) };
      return resultado(`AS${n} · ${ov.data.holder}${ov.data.announced ? '' : ' (não anunciado)'} · ${prefixos.length} faixa(s) anunciada(s).`, dados, lista, []);
    },
  },

  site_checar: {
    name: 'site_checar',
    description: 'Visita um site uma vez, como um navegador, e relata: status e redirecionamentos, servidor e tecnologia aparente, cabeçalhos de segurança presentes ou ausentes (HSTS, CSP, X-Frame-Options e outros), atributos dos cookies e o certificado TLS (emissor, validade, dias restantes). Não testa falhas nem envia payloads.',
    schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    run: async ({ url }) => {
      const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const r = await buscarSeguro(u, { timeoutMs: 15000, maxBytes: 2 * 1024 * 1024 });
      const h = r.headers;
      const { lista, cite } = fontes();
      const n = cite(r.urlFinal, r.urlFinal, 'site visitado');
      const seg = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy'];
      const presentes = Object.fromEntries(seg.map((k) => [k, h[k] ? texto(h[k], 200) : null]));
      const cookies = [].concat(h['set-cookie'] || []).map((c) => {
        const nome = c.split('=')[0];
        return { nome, secure: /;\s*secure/i.test(c), httponly: /;\s*httponly/i.test(c), samesite: (c.match(/;\s*samesite=([^;]+)/i) || [])[1] || null };
      });
      const html = /html/.test(String(h['content-type'] || '')) ? r.corpo.toString('utf8') : '';
      const pistas = [];
      if (/\/_next\//.test(html)) pistas.push('Next.js');
      if (/wp-content|wp-includes/.test(html)) pistas.push('WordPress');
      if (/cdn\.shopify\.com/.test(html)) pistas.push('Shopify');
      const gen = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) || [])[1];
      if (gen) pistas.push(`generator: ${gen}`);
      let tls = null;
      const c = r.tls;
      if (c && c.valid_to) {
        const dias = Math.round((new Date(c.valid_to) - Date.now()) / 864e5);
        tls = { emitido_para: c.subject?.CN || null, emissor: c.issuer?.O || c.issuer?.CN || null, valido_ate: new Date(c.valid_to).toISOString().slice(0, 10), dias_restantes: dias, nomes_alternativos: String(c.subjectaltname || '').split(',').length };
      }
      const dados = { url_final: r.urlFinal, status: r.status, redirecionamentos: r.cadeia, ip: r.ip, servidor: h.server || null, powered_by: h['x-powered-by'] || null, tecnologia: pistas, titulo: html ? htmlParaTexto(html).titulo : null, cabecalhos_seguranca: presentes, cookies, tls, fonte: n };
      const faltando = seg.filter((k) => !presentes[k]);
      return resultado(`${r.urlFinal} respondeu ${r.status}${h.server ? ` (servidor ${h.server})` : ''}. Cabeçalhos de segurança ausentes: ${faltando.length ? faltando.join(', ') : 'nenhum'}.${tls ? ` Certificado de ${tls.emissor}, vence em ${tls.dias_restantes} dias.` : ''} [${n}]`, dados, lista,
        ['Uma visita só, sem testar falhas. Cabeçalhos podem mudar por página ou por região.']);
    },
  },

  portas_publicas: {
    name: 'portas_publicas',
    description: 'Portas, serviços e CVEs associados a um host, segundo varreduras públicas já feitas por terceiros (Shodan InternetDB). Resolve o nome e consulta cada IP. O 451 não varre nem testa portas.',
    schema: { type: 'object', properties: { host: { type: 'string', description: 'domínio ou IP' } }, required: ['host'] },
    run: async ({ host }) => {
      const s = String(host || '').trim();
      let ips;
      if (net.isIP(s)) ips = [conferirIp(s)];
      else {
        const d = conferirDominio(s);
        ips = [...new Set((await dns.lookup(d, { all: true }).catch(() => [])).map((x) => x.address))].filter((ip) => !ipBloqueado(ip)).slice(0, 6);
        if (!ips.length) throw new ErroFerramenta('o domínio não resolve para IP público', 'dns');
      }
      const { lista, cite } = fontes();
      const res = await Promise.all(ips.map(async (ip) => {
        const d = await internetdb(ip);
        return { ip, portas: d?.ports || [], nomes: (d?.hostnames || []).slice(0, 8), cpes: (d?.cpes || []).slice(0, 8), cves: (d?.vulns || []).slice(0, 15), tags: d?.tags || [], fonte: cite(`Shodan InternetDB ${ip}`, `https://internetdb.shodan.io/${ip}`) };
      }));
      const todas = [...new Set(res.flatMap((r) => r.portas))].sort((a, b) => a - b);
      return resultado(`${s}: ${todas.length ? `portas vistas publicamente ${todas.join(', ')}` : 'nenhuma porta registrada nas varreduras públicas'} (${ips.length} IP).`, res, lista,
        ['Dados de varreduras públicas de terceiros: podem estar desatualizados ou incompletos. Nenhuma porta foi testada pelo 451.']);
    },
  },
};
