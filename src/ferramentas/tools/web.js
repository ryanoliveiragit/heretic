// Leitura de uma página pública, com a saída de rede protegida (lib/rede-segura.js).
import { resultado, fontes, texto, ErroFerramenta } from '../lib/comum.js';
import { buscarSeguro, robotsPermite, htmlParaTexto } from '../lib/rede-segura.js';

export const tools = {
  pagina_ler: {
    name: 'pagina_ler',
    description: 'Lê uma página pública (aviso de segurança, changelog, relatório, política de programa de bug bounty) e devolve o texto. Só http/https nas portas 80 e 443, respeita robots.txt e recusa endereços internos. Use só com URLs que o usuário mandou ou que vieram de uma busca ou consulta de CVE.',
    schema: { type: 'object', properties: { url: { type: 'string' }, max_caracteres: { type: 'number', description: 'até 30000 (padrão 12000)' } }, required: ['url'] },
    run: async ({ url, max_caracteres = 12000 }) => {
      if (!(await robotsPermite(url))) throw new ErroFerramenta('o robots.txt do site não permite ler esta página', 'robots');
      const r = await buscarSeguro(url, { timeoutMs: 15000, maxBytes: 10 * 1024 * 1024 });
      const tipo = String(r.headers['content-type'] || '').toLowerCase();
      if (!/text\/|json|xml|html/.test(tipo)) throw new ErroFerramenta(`tipo de conteúdo não suportado (${tipo || 'desconhecido'})`, 'tipo');
      const bruto = r.corpo.toString('utf8');
      const { titulo, texto: corpo } = /html/.test(tipo) ? htmlParaTexto(bruto) : { titulo: '', texto: bruto };
      const max = Math.min(Math.max(Number(max_caracteres) || 12000, 500), 30000);
      const { lista, cite } = fontes();
      const n = cite(titulo || r.urlFinal, r.urlFinal, 'página lida');
      const lim = [];
      if (r.cortado) lim.push('Página maior que 10 MB: lida só a parte inicial.');
      if (corpo.length > max) lim.push(`Texto cortado em ${max} caracteres de ${corpo.length}.`);
      return resultado(`${titulo || r.urlFinal} (HTTP ${r.status}) [${n}]`, { url: r.urlFinal, status: r.status, titulo, texto: corpo.slice(0, max) }, lista, lim);
    },
  },
};
