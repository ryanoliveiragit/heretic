// Uso: node scripts/gera-defs-ferramentas.mjs [--conferir]
// O pacote src/ferramentas precisa do Node; o chat roda no Edge e só precisa dos nomes, descrições e esquemas.
// Gera src/ferramentas-defs.js a partir do pacote. --conferir falha se o arquivo gerado estiver desatualizado.
import { writeFileSync, readFileSync } from 'node:fs';
import { ferramentas, INSTRUCAO_SISTEMA } from '../src/ferramentas/index.js';
const defs = Object.values(ferramentas).map((t) => ({ name: t.name, description: t.description, schema: t.schema }));
const saida = `// Gerado por scripts/gera-defs-ferramentas.mjs a partir de src/ferramentas (o pacote precisa do Node; o Edge só usa
// nomes, descrições e esquemas). Não edite à mão: rode o script de novo quando o pacote mudar.
export const DEFINICOES = ${JSON.stringify(defs, null, 2)};

export const INSTRUCAO_SISTEMA = ${JSON.stringify(INSTRUCAO_SISTEMA)};
`;
const alvo = new URL('../src/ferramentas-defs.js', import.meta.url);
if (process.argv.includes('--conferir')) {
  const atual = readFileSync(alvo, 'utf8');
  if (atual !== saida) { console.error('src/ferramentas-defs.js desatualizado: rode node scripts/gera-defs-ferramentas.mjs'); process.exit(1); }
  console.log(`definições em dia (${defs.length} ferramentas)`);
} else {
  writeFileSync(alvo, saida);
  console.log(`gravado src/ferramentas-defs.js (${defs.length} ferramentas)`);
}
