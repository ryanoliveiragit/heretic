// Vulnerabilidades: CVE no NVD, exploração conhecida (CISA KEV), probabilidade de exploração (FIRST EPSS)
// e falhas por pacote (OSV). Tudo de fontes públicas e grátis; nada é executado contra alvo nenhum.
import { buscarJson, doCache, fontes, resultado, texto, ErroFerramenta } from '../lib/comum.js';

const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const KEV = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const EPSS = 'https://api.first.org/data/v1/epss';
const OSV = 'https://api.osv.dev/v1';

const kev = () => doCache('kev', 6 * 3600e3, async () => {
  const d = await buscarJson(KEV, { timeoutMs: 30000 });
  const mapa = new Map();
  for (const v of d?.vulnerabilities || []) mapa.set(v.cveID.toUpperCase(), v);
  return { versao: d?.catalogVersion, data: d?.dateReleased, mapa };
});

function metricas(cve) {
  const m = cve.metrics || {};
  const pega = (lista) => (lista || []).find((x) => x.type === 'Primary') || (lista || [])[0];
  const v40 = pega(m.cvssMetricV40), v31 = pega(m.cvssMetricV31), v30 = pega(m.cvssMetricV30), v2 = pega(m.cvssMetricV2);
  const x = v40 || v31 || v30 || v2;
  if (!x) return null;
  return { versao: x.cvssData.version, nota: x.cvssData.baseScore, gravidade: x.cvssData.baseSeverity || x.baseSeverity, vetor: x.cvssData.vectorString, fonte: x.source };
}

function resumoCve(cve) {
  const desc = (cve.descriptions || []).find((d) => d.lang === 'en')?.value || '';
  const cwes = [...new Set((cve.weaknesses || []).flatMap((w) => w.description.map((d) => d.value)).filter((v) => v.startsWith('CWE-')))];
  return { id: cve.id, publicado: cve.published?.slice(0, 10), atualizado: cve.lastModified?.slice(0, 10), status: cve.vulnStatus, descricao: texto(desc, 900), cvss: metricas(cve), cwe: cwes };
}

async function epssDe(ids) {
  if (!ids.length) return new Map();
  const d = await buscarJson(`${EPSS}?cve=${ids.join(',')}`).catch(() => null);
  return new Map((d?.data || []).map((e) => [e.cve.toUpperCase(), { pontuacao: Number(e.epss), percentil: Number(e.percentile), data: e.date }]));
}

export const tools = {
  cve_consultar: {
    name: 'cve_consultar',
    description: 'Consulta um CVE pelo ID: descrição, nota CVSS e vetor, CWE, se está na lista de exploração conhecida da CISA (KEV) com data, probabilidade de exploração (EPSS) e referências. Use antes de responder sobre um CVE específico e cite as fontes.',
    schema: { type: 'object', properties: { id: { type: 'string', description: 'ID do CVE, ex.: CVE-2021-44228' } }, required: ['id'] },
    run: async ({ id }) => {
      const cveId = String(id || '').trim().toUpperCase();
      if (!/^CVE-\d{4}-\d{4,}$/.test(cveId)) throw new ErroFerramenta('ID de CVE inválido (formato CVE-AAAA-NNNN)', 'entrada');
      const { lista, cite } = fontes();
      const [nvd, k, ep] = await Promise.all([
        doCache('nvd:' + cveId, 3600e3, () => buscarJson(`${NVD}?cveId=${cveId}`, { timeoutMs: 20000 })),
        kev().catch(() => null),
        epssDe([cveId]),
      ]);
      const item = nvd?.vulnerabilities?.[0]?.cve;
      if (!item) return resultado(`${cveId} não foi encontrado no NVD.`, null, [], ['O CVE pode ser reservado, rejeitado ou ainda não publicado.']);
      const r = resumoCve(item);
      const nNvd = cite(`${cveId} · NVD`, `https://nvd.nist.gov/vuln/detail/${cveId}`);
      const kv = k?.mapa.get(cveId);
      const e = ep.get(cveId);
      const dados = {
        ...r,
        fonte_cvss: nNvd,
        kev: kv ? { na_lista: true, adicionado: kv.dateAdded, prazo_correcao: kv.dueDate, usado_em_ransomware: kv.knownRansomwareCampaignUse, fornecedor: kv.vendorProject, produto: kv.product, acao: texto(kv.requiredAction, 300), fonte: cite(`${cveId} · CISA KEV`, 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog') } : { na_lista: false, fonte: k ? cite('Catálogo CISA KEV', 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog') : null },
        epss: e ? { ...e, fonte: cite(`${cveId} · FIRST EPSS`, `https://api.first.org/data/v1/epss?cve=${cveId}`) } : null,
        referencias: (item.references || []).slice(0, 8).map((x) => ({ url: x.url, tags: x.tags || [] })),
      };
      const partes = [`${cveId}${r.cvss ? ` · CVSS ${r.cvss.versao} ${r.cvss.nota} ${r.cvss.gravidade || ''}` : ''} [${nNvd}]`];
      if (kv) partes.push(`Na lista KEV da CISA desde ${kv.dateAdded}${kv.knownRansomwareCampaignUse === 'Known' ? ', com uso conhecido em ransomware' : ''} [${dados.kev.fonte}]`);
      else if (k) partes.push(`Não está na lista KEV da CISA [${dados.kev.fonte}]`);
      if (e) partes.push(`EPSS ${(e.pontuacao * 100).toFixed(2)}% (percentil ${(e.percentil * 100).toFixed(1)}) [${dados.epss.fonte}]`);
      return resultado(partes.join('. ') + '.', dados, lista, k ? [] : ['A lista KEV da CISA não respondeu nesta consulta.']);
    },
  },

  cve_buscar: {
    name: 'cve_buscar',
    description: 'Busca CVEs por palavra-chave (produto, biblioteca, fornecedor) no NVD. Pode filtrar só os que estão na lista KEV da CISA e por nota CVSS mínima. Devolve os mais recentes primeiro.',
    schema: { type: 'object', properties: { termo: { type: 'string' }, so_kev: { type: 'boolean' }, cvss_min: { type: 'number' }, limite: { type: 'number', description: 'até 20' } }, required: ['termo'] },
    run: async ({ termo, so_kev = false, cvss_min = 0, limite = 10 }) => {
      const t = String(termo || '').trim();
      if (t.length < 2) throw new ErroFerramenta('termo curto demais', 'entrada');
      const n = Math.min(Math.max(Number(limite) || 10, 1), 20);
      const { lista, cite } = fontes();
      const k = await kev().catch(() => null);
      let itens = [];
      if (so_kev && k) {
        const tl = t.toLowerCase();
        itens = [...k.mapa.values()].filter((v) => `${v.vendorProject} ${v.product} ${v.vulnerabilityName} ${v.cveID}`.toLowerCase().includes(tl))
          .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)).slice(0, 60).map((v) => v.cveID);
        if (itens.length) {
          const det = await Promise.all(itens.slice(0, n * 2).map((id) => doCache('nvd:' + id, 3600e3, () => buscarJson(`${NVD}?cveId=${id}`, { timeoutMs: 20000 })).catch(() => null)));
          itens = det.map((d) => d?.vulnerabilities?.[0]?.cve).filter(Boolean);
        }
      } else {
        const d = await doCache('nvdq:' + t, 1800e3, () => buscarJson(`${NVD}?keywordSearch=${encodeURIComponent(t)}&resultsPerPage=100`, { timeoutMs: 25000 }));
        itens = (d?.vulnerabilities || []).map((v) => v.cve);
      }
      let res = itens.map(resumoCve).filter((r) => !cvss_min || (r.cvss?.nota ?? 0) >= cvss_min)
        .sort((a, b) => (b.publicado || '').localeCompare(a.publicado || '')).slice(0, n);
      const ep = await epssDe(res.map((r) => r.id));
      res = res.map((r) => ({ id: r.id, publicado: r.publicado, cvss: r.cvss?.nota ?? null, gravidade: r.cvss?.gravidade ?? null, na_kev: !!k?.mapa.get(r.id), epss: ep.get(r.id)?.pontuacao ?? null, descricao: texto(r.descricao, 240), fonte: cite(`${r.id} · NVD`, `https://nvd.nist.gov/vuln/detail/${r.id}`) }));
      const filtro = [so_kev ? 'só KEV' : '', cvss_min ? `CVSS ≥ ${cvss_min}` : ''].filter(Boolean).join(', ');
      return resultado(`${res.length} CVE(s) para "${t}"${filtro ? ` (${filtro})` : ''}.`, res, lista, ['A busca do NVD é por palavra no texto: pode trazer CVEs que só citam o termo.']);
    },
  },

  pacote_vulnerabilidades: {
    name: 'pacote_vulnerabilidades',
    description: 'Lista falhas conhecidas de um pacote de software (npm, PyPI, Maven, Go, crates.io, NuGet, RubyGems, Packagist, Debian, Ubuntu e outros) pelo OSV, com versões afetadas e corrigidas. Informe a versão para saber se ela está vulnerável.',
    schema: { type: 'object', properties: { pacote: { type: 'string', description: 'ex.: lodash, django, org.apache.logging.log4j:log4j-core' }, ecossistema: { type: 'string', description: 'npm, PyPI, Maven, Go, crates.io, NuGet, RubyGems, Packagist, Debian, Ubuntu…' }, versao: { type: 'string' } }, required: ['pacote', 'ecossistema'] },
    run: async ({ pacote, ecossistema, versao }) => {
      if (!pacote || !ecossistema) throw new ErroFerramenta('informe pacote e ecossistema', 'entrada');
      const corpo = { package: { name: String(pacote).trim(), ecosystem: String(ecossistema).trim() }, ...(versao ? { version: String(versao).trim() } : {}) };
      const d = await buscarJson(`${OSV}/query`, { metodo: 'POST', corpo, timeoutMs: 20000 });
      const { lista, cite } = fontes();
      const vulns = (d?.vulns || []).slice(0, 25).map((v) => {
        const corrigido = [...new Set((v.affected || []).flatMap((a) => (a.ranges || []).flatMap((r) => (r.events || []).map((e) => e.fixed).filter(Boolean))))];
        return { id: v.id, cves: (v.aliases || []).filter((a) => a.startsWith('CVE-')), resumo: texto(v.summary || v.details, 240), publicado: v.published?.slice(0, 10), gravidade: v.database_specific?.severity || (v.severity || [])[0]?.score || null, corrigido_em: corrigido.slice(0, 6), fonte: cite(`${v.id} · OSV`, `https://osv.dev/vulnerability/${v.id}`) };
      });
      const quem = `${corpo.package.name} (${corpo.package.ecosystem})${versao ? ` ${versao}` : ''}`;
      return resultado(vulns.length ? `${vulns.length} falha(s) conhecida(s) para ${quem}.` : `Nenhuma falha conhecida no OSV para ${quem}.`, vulns, lista, (d?.vulns || []).length > 25 ? ['Mostrando 25 de ' + d.vulns.length + '.'] : []);
    },
  },
};
