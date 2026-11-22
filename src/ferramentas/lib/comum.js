// Base comum das ferramentas do 451: rede com prazo, cache curto, fontes numeradas e corte de tamanho.
// Sem dependências: só Node 18+ (fetch, AbortController) e módulos nativos.

export const UA = '451-ferramentas/1.0 (+https://451sh.com)';
export const LIMITE_RESULTADO = 40 * 1024; // o registro do agente corta em 40 KB

const cache = new Map();
export function doCache(chave, ttlMs, fn) {
  const agora = Date.now();
  const c = cache.get(chave);
  if (c && c.expira > agora) return c.valor;
  const valor = Promise.resolve().then(fn).catch((e) => { cache.delete(chave); throw e; });
  cache.set(chave, { expira: agora + ttlMs, valor });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return valor;
}

export class ErroFerramenta extends Error {
  constructor(mensagem, codigo = 'erro') { super(mensagem); this.codigo = codigo; }
}

export async function buscarJson(url, { timeoutMs = 15000, headers = {}, metodo = 'GET', corpo } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  // chave opcional do NVD (sem ela o limite é 5 consultas a cada 30 s)
  const extra = url.startsWith('https://services.nvd.nist.gov/') && process.env.NVD_API_KEY ? { apiKey: process.env.NVD_API_KEY } : {};
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: { 'user-agent': UA, accept: 'application/json', ...(corpo ? { 'content-type': 'application/json' } : {}), ...extra, ...headers },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ac.signal,
      redirect: 'follow',
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new ErroFerramenta(`${new URL(url).host} respondeu ${r.status}`, 'fonte_indisponivel');
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new ErroFerramenta(`${new URL(url).host} não respondeu em ${timeoutMs / 1000} s`, 'tempo_esgotado');
    throw e;
  } finally { clearTimeout(t); }
}

// Monta a lista de fontes numeradas e devolve a função que cita
export function fontes() {
  const lista = [];
  const cite = (titulo, url, origem = 'fonte externa') => {
    let i = lista.findIndex((f) => f.url === url);
    if (i < 0) { lista.push({ n: lista.length + 1, titulo, url, origem }); i = lista.length - 1; }
    return lista[i].n;
  };
  return { lista, cite };
}

export function resultado(resumo, dados, listaFontes, limitacoes = []) {
  return { resumo, dados, fontes: listaFontes, limitacoes };
}

// Texto para o modelo: resumo, dados em JSON e fontes numeradas, cortado no limite
export function comoTexto(res) {
  if (typeof res === 'string') return res.slice(0, LIMITE_RESULTADO);
  const partes = [res.resumo || ''];
  if (res.dados !== undefined) partes.push('DADOS\n' + JSON.stringify(res.dados, null, 1));
  if (res.limitacoes?.length) partes.push('LIMITES\n- ' + res.limitacoes.join('\n- '));
  if (res.fontes?.length) partes.push('FONTES (cite como [n])\n' + res.fontes.map((f) => `[${f.n}] ${f.titulo} — ${f.url}`).join('\n'));
  let txt = partes.filter(Boolean).join('\n\n');
  if (txt.length > LIMITE_RESULTADO) txt = txt.slice(0, LIMITE_RESULTADO - 40) + '\n[resultado cortado em 40 KB]';
  return txt;
}

export function texto(v, max = 600) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
