// Pacote de ferramentas do 451 para o chat e o agente.
// Uso:
//   import { ferramentas, paraOpenAI, executar } from './index.js'
//   tools: paraOpenAI()            → lista no formato de function calling (OpenAI, OpenRouter)
//   const txt = await executar(nome, args)  → texto pronto para devolver ao modelo, com fontes [n]
import { tools as vulnerabilidades } from './tools/vulnerabilidades.js';
import { tools as web } from './tools/web.js';
import { tools as rede } from './tools/rede.js';
import { comoTexto, ErroFerramenta } from './lib/comum.js';

export const ferramentas = { ...vulnerabilidades, ...web, ...rede };

export function paraOpenAI(nomes) {
  return Object.values(ferramentas)
    .filter((t) => !nomes || nomes.includes(t.name))
    .map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }));
}

export function paraAnthropic(nomes) {
  return Object.values(ferramentas)
    .filter((t) => !nomes || nomes.includes(t.name))
    .map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
}

// Executa e devolve { ok, texto, resultado }. Nunca lança: erro vira texto claro para o modelo.
export async function executar(nome, args = {}) {
  const t = ferramentas[nome];
  if (!t) return { ok: false, texto: `Ferramenta desconhecida: ${nome}`, resultado: null };
  try {
    const r = await t.run(typeof args === 'string' ? JSON.parse(args || '{}') : (args || {}));
    return { ok: true, texto: comoTexto(r), resultado: r };
  } catch (e) {
    const msg = e instanceof ErroFerramenta ? e.message : `falha ao consultar (${e.message || e})`;
    return { ok: false, texto: `${nome}: ${msg}`, resultado: null, codigo: e.codigo || 'erro' };
  }
}

// Instrução curta para o prompt de sistema
export const INSTRUCAO_SISTEMA = 'Você tem ferramentas de consulta: cve_consultar, cve_buscar, pacote_vulnerabilidades, pagina_ler, ip_info, dominio_info, asn_info, site_checar e portas_publicas. Use-as antes de afirmar fatos sobre CVEs, pacotes, IPs, domínios ou sites, e cite as fontes como [n], na mesma numeração que a ferramenta devolveu. As ferramentas de rede só usam dados públicos: não diga que o 451 varreu ou testou o alvo.';
