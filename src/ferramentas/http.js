// Porta de entrada das ferramentas de segurança (dono 21/11, via Super Hacking). O pacote precisa do Node: resolve o
// nome antes e prende a conexão ao IP conferido (proteção contra SSRF), o que o Edge da Vercel não tem. No ar roda na
// função api/ferramentas.js (runtime Node); no servidor local, na rota POST /api/ferramentas de src/server.js.
// Só o próprio servidor do 451 chama: o token é o sha256 de "451-ferramentas:" + ACCESS_SECRET (nunca vai ao cliente).
import { createHash, timingSafeEqual } from 'node:crypto';
import { executar, ferramentas } from './index.js';

export function tokenInterno() {
  const segredo = process.env.ACCESS_SECRET;
  return segredo ? createHash('sha256').update(`451-ferramentas:${segredo}`).digest('hex') : '';
}

function iguais(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Atende { nome, args } com o token interno. Devolve { status, corpo }; o corpo de 200 é o { ok, texto, resultado } do pacote. */
export async function atende(token, corpo) {
  const esperado = tokenInterno();
  if (!esperado || !iguais(token, esperado)) return { status: 401, corpo: { error: 'unauthorized' } };
  const nome = String(corpo?.nome || '');
  if (!Object.prototype.hasOwnProperty.call(ferramentas, nome)) return { status: 400, corpo: { error: 'ferramenta_desconhecida' } };
  const args = corpo?.args && typeof corpo.args === 'object' ? corpo.args : {};
  return { status: 200, corpo: await executar(nome, args) };
}
