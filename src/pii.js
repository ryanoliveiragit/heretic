// Higiene de PII nos resultados de busca (LGPD — dono, 18/11).
// O site é grátis e aberto: qualquer pessoa pesquisa qualquer pessoa. Sites de consulta de
// CPF/cartório/bureau/processo trazem dado de TERCEIROS junto (caso databrasil.net: um CPF
// alheio apareceu num card de fonte de pesquisa de pessoa). Regra dura: antes de qualquer
// resultado de busca chegar à IA ou aos cards de fonte na tela, (1) descartamos fontes dos
// sites de consulta/vazamento abaixo e (2) mascaramos CPF, telefone, CEP e e-mail no texto.
// Mascarar com ••• (em vez de apagar em silêncio) deixa a IA saber que havia um dado — ela
// pode dizer "oculto" em vez de inventar número.

// Consultas de pessoa/CNPJ: a página lista N pessoas com o mesmo nome; o dado exibido quase
// sempre é de terceiro (CPF, fatura, sócio). Servem pra conferência humana, não pra card público.
const HOSTS_BLOQUEADOS = [
  'databrasil.net',           // o caso de 18/11 — consulta de CPF
  'casadosdados.com.br',      // registro civil (casamentos)
  'serasa.com.br',            // bureau de crédito
  'consultacpf.com.br',
  'consultacpf.com',
  'cpfbrasil.com.br',
  'consultacpfonline.com.br',
  'minhascontas.online',      // faturas e contas de clientes
  'cnpj.biz',
  'cnpj.info',
  'cnpjsimples.com.br',
  'consultasimples.com.br',
  'e-cnpj.info',              // razão social + sócios
  'jusbrasil.com.br',         // acórdãos/andamentos (nome + CPF em processo)
];
const SUFIXOS_BLOQUEADOS = [
  'jus.br', // CNJ + todos os tribunais brasileiros (processo expõe nome, CPF, endereço)
];

function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }

/** Verdadeiro quando a fonte é um site de consulta/vazamento (ver lista acima). */
export function isBlockedSource(url) {
  const h = hostOf(url);
  if (!h) return false;
  for (const s of SUFIXOS_BLOQUEADOS) if (h === s || h.endsWith('.' + s)) return true;
  for (const b of HOSTS_BLOQUEADOS) if (h === b || h.endsWith('.' + b)) return true;
  return false;
}

const MASK = '•••';

/**
 * Mascara dados pessoais em texto livre de busca: e-mail, CPF (pontuado ou 11 dígitos),
 * telefone com DDD, CEP e endereço (via/rua + número). O resto passa intacto — os padrões
 * exigem estrutura (DDD, ", número") justamente pra poupar versão/data/número comum.
 */
export function sanitizePii(text) {
  let t = String(text ?? '');
  if (!t) return t;
  t = t.replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi, MASK); // e-mail
  t = t.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, MASK);     // CPF pontuado
  t = t.replace(/\b\d{11}\b/g, MASK);                        // documento de 11 dígitos corrido
  t = t.replace(/(?:\+\d{1,2}[\s.-]?)?\(?(\d{2})\)?[\s.-]?(\d{4,5})[\s.-]?(\d{4})\b/g, MASK); // telefone c/ DDD
  t = t.replace(/\b\d{5}-\d{3}\b/g, MASK);                   // CEP 01310-100
  t = t.replace(/\b(rua|avenida|av\.?|travessa|pra[çc]a|estrada|rodovia|alameda|largo|beco)\s+[^,\n]{2,45}?,\s*\d{1,6}\b/gi, MASK); // endereço
  return t;
}

/**
 * Limpa uma lista de fontes de busca: remove URLs duplicadas, descarta sites de
 * consulta/vazamento e mascara PII em título e trecho. Retorna { sources, removed }.
 */
export function cleanSources(sources) {
  const seen = new Set();
  const kept = [];
  let removed = 0;
  for (const s of sources || []) {
    if (!s || typeof s.url !== 'string' || !s.url) continue;
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    if (isBlockedSource(s.url)) { removed++; continue; }
    kept.push({ url: s.url, title: sanitizePii(s.title || ''), snippet: sanitizePii(s.snippet || '') });
  }
  return { sources: kept, removed };
}
