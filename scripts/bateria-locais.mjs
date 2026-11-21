// Uso: node scripts/bateria-locais.mjs <pasta src> <pasta de saída> <modelos separados por vírgula> [max_tokens]
// Bateria dos modelos locais (dono 21/11). Passa pelo MESMO caminho do site (streamChat → streamLocal, com o
// prompt do plano grátis, persona e identidade) até o porteiro (127.0.0.1:8017) e o gateway local.
// Custo zero: nada vai para provedor pago. Verificação automática (sem juiz pago): resposta exata, idioma,
// código rodado com testes, formato que o app desenha, instrução, texto longo, identidade, velocidade,
// laço e corte por teto de tokens. Grava <saída>/<modelo>.json.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [SRC, OUT, LISTA, MAX] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[k];
process.env.LOCAL_LLM_URL = 'http://127.0.0.1:8017';
process.env.LOCAL_LLM_TOKEN = readFileSync('/home/ethical/.config/451-local/token', 'utf8').trim();
const { streamChat, MODEL_CATALOG } = await import(`${SRC}/upstream.js`);
const { getPersona } = await import(`${SRC}/persona.js`);
const { LOCAL_MODELS } = await import(`${SRC}/plans.js`);
const MAX_TOKENS = Number(MAX) || 900; // hoje: teto de saída do plano grátis

// ── verificadores ──
const sem = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2010-\u2015\u2212]/g, '-').toLowerCase(); // hífen especial (U+2011) vira -
const PT = /\b(que|nao|para|com|uma|um|voce|e|sao|esta|dos|das|do|da|no|na|em|por|mais|como|se|ao|os|as|segunda|terca|quarta|quinta|sexta|sabado|domingo|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|minutos?|reais|codigo|sim)\b/g;
const EN = /\b(the|and|is|are|you|with|for|this|that|of|to|it|on|monday|tuesday|wednesday|thursday|friday|saturday|sunday|minutes?|answer)\b/g;
function idioma(texto) {
  const s = sem(String(texto).replace(/```[\s\S]*?```/g, ' '));
  const pt = (s.match(PT) || []).length, en = (s.match(EN) || []).length;
  return { ok: en <= pt, pt, en }; // só número ou nome (sem palavra de nenhuma língua) não reprova
}
const OPCAO = /^\s*(?:[-*•·–—]|\d{1,2}[.)])\s+(.+)$/;
const bloco = (t, linguas) => { const m = new RegExp('```(' + linguas + ')[^\\n]*\\n([\\s\\S]*?)```', 'i').exec(t); return m ? m[2] : null; };
function rodaPython(texto, nomeFuncao, testes) {
  const codigo = bloco(texto, 'python|py') ?? bloco(texto, '');
  if (!codigo) return { ok: false, nota: 'sem bloco de código' };
  if (/\bimport\s+(os|sys|subprocess|socket|shutil|pathlib|requests|urllib|ctypes|importlib|http|multiprocessing|threading)\b|from\s+(os|sys|subprocess|socket|shutil|pathlib)\b|__import__|\bopen\(|\beval\(|\bexec\(/.test(codigo)) return { ok: false, nota: 'código com chamada bloqueada: não executado' };
  if (!new RegExp(`def\\s+${nomeFuncao}\\s*\\(`).test(codigo)) return { ok: false, nota: `sem a função ${nomeFuncao}` };
  const dir = mkdtempSync('/tmp/opencode/bateria-py-');
  const casos = testes.map(([expr, esperado]) => `try:\n    _r.append(bool((${expr}) == (${esperado})))\nexcept Exception:\n    _r.append(False)`).join('\n');
  writeFileSync(`${dir}/t.py`, `${codigo}\n\nimport json as _json\n_r = []\n${casos}\nprint(_json.dumps(_r))\n`);
  const r = spawnSync('python3', ['-I', `${dir}/t.py`], { cwd: dir, timeout: 10000, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  let res = []; try { res = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { /* erro */ }
  const acertos = res.filter(Boolean).length;
  return { ok: acertos === testes.length, nota: `${acertos}/${testes.length} testes${r.status ? ` (saída ${r.status})` : ''}` };
}
const contem = (re, nota) => (t) => ({ ok: re.test(sem(t)), nota });

// Texto longo com uma informação no meio (~3 mil tokens).
const FRASES = [
  'A prefeitura anunciou novas linhas de ônibus para os bairros da zona norte.',
  'O mercado municipal abriu mais cedo por causa do feriado prolongado.',
  'Choveu forte durante a tarde e o trânsito ficou lento na avenida principal.',
  'A biblioteca pública recebeu uma doação de livros didáticos usados.',
  'O time da cidade venceu o jogo de domingo por dois a um.',
  'Os moradores pediram mais iluminação na praça central.',
];
const partes = [];
for (let i = 1; i <= 120; i++) partes.push(`Nota ${i}: ${FRASES[i % FRASES.length]}`);
partes.splice(60, 0, 'Observação importante: o código do armário de ferramentas é 7319.');
const TEXTO_LONGO = partes.join('\n');

const CASOS = [
  { id: 'pt-dia', grupo: 'Português', pergunta: 'Que dia da semana vem depois de domingo?', checa: contem(/segunda/, 'segunda-feira') },
  { id: 'pt-plural', grupo: 'Português', pergunta: "Qual é o plural de 'cidadão'?", checa: contem(/cidadaos/, 'cidadãos') },
  { id: 'pt-traducao', grupo: 'Português', pergunta: "Traduza para o português: 'The meeting was postponed until next week.'", checa: contem(/reuniao[\s\S]*(adiad|transferid|remarcad)[\s\S]*semana/, 'reunião adiada… semana') },
  { id: 'conta-desconto', grupo: 'Raciocínio', pergunta: 'Uma camiseta custa R$ 80 e está com 25% de desconto. Quanto ela fica? Responda só com o valor.', checa: contem(/\b60\b/, 'R$ 60') },
  { id: 'data-semana', grupo: 'Raciocínio', pergunta: 'Que dia da semana foi 7 de setembro de 2022? Responda só o dia.', checa: contem(/quarta/, 'quarta-feira') },
  { id: 'maquinas', grupo: 'Raciocínio', pergunta: 'Se 3 máquinas fazem 3 peças em 3 minutos, quanto tempo 100 máquinas levam para fazer 100 peças? Responda só o tempo.', checa: contem(/\b3\b|tres/, '3 minutos') },
  { id: 'multiplicacao', grupo: 'Raciocínio', pergunta: 'Quanto é 17 × 23? Responda só o número.', checa: contem(/\b391\b/, '391') },
  { id: 'ordem', grupo: 'Raciocínio', pergunta: 'Ana é mais velha que Bia. Bia é mais velha que Carla. Quem é a mais nova? Responda só o nome.', checa: contem(/carla/, 'Carla') },
  { id: 'codigo-ipv4', grupo: 'Código', pergunta: 'Escreva uma função Python valida_ipv4(s: str) -> bool que diga se a string é um IPv4 válido: 4 números de 0 a 255 separados por ponto, sem espaços e sem zero à esquerda (o próprio 0 vale). Mande só o código, num bloco python.',
    checa: (t) => rodaPython(t, 'valida_ipv4', [["valida_ipv4('192.168.0.1')", 'True'], ["valida_ipv4('255.255.255.255')", 'True'], ["valida_ipv4('0.0.0.0')", 'True'], ["valida_ipv4('256.1.1.1')", 'False'], ["valida_ipv4('1.2.3')", 'False'], ["valida_ipv4('01.2.3.4')", 'False'], ["valida_ipv4('a.b.c.d')", 'False'], ["valida_ipv4('1.2.3.4.5')", 'False'], ["valida_ipv4('')", 'False'], ["valida_ipv4('1..2.3')", 'False'], ["valida_ipv4(' 1.2.3.4')", 'False']]) },
  { id: 'codigo-vogais', grupo: 'Código', pergunta: 'Escreva uma função Python conta_vogais(texto: str) -> int que conte as vogais (a, e, i, o, u), com ou sem acento, maiúsculas ou minúsculas. Mande só o código, num bloco python.',
    checa: (t) => rodaPython(t, 'conta_vogais', [["conta_vogais('abc')", '1'], ["conta_vogais('ÁÉÍÓÚ')", '5'], ["conta_vogais('xyz')", '0'], ["conta_vogais('Programação')", '5'], ["conta_vogais('Ônibus')", '3'], ["conta_vogais('')", '0']]) },
  { id: 'formato-pizza', grupo: 'Formato do app', pergunta: 'Mostre num gráfico de pizza a divisão: Web 50, Rede 30, Mobile 20.',
    checa: (t) => { const m = bloco(t, 'mermaid'); const c = bloco(t, 'chart'); let jsonOk = false; try { jsonOk = !!c && !!JSON.parse(c); } catch { /* */ } return { ok: !!(m && /^\s*pie\b/i.test(m.trim())) || jsonOk, nota: m ? 'mermaid' : c ? 'chart' : 'sem gráfico' }; } },
  { id: 'formato-opcoes', grupo: 'Formato do app', pergunta: 'Me pergunte, com opções para eu clicar, qual sistema operacional eu uso.',
    checa: (t) => { const b = bloco(t, 'ask|select|options?|escolha|op[çc][õo]es|pergunta'); const n = b ? b.split('\n').filter((l) => OPCAO.test(l)).length : 0; return { ok: n >= 2, nota: b ? `${n} opções` : 'sem cartão de opções' }; } },
  { id: 'formato-tabela', grupo: 'Formato do app', pergunta: 'Compare numa tabela Python, JavaScript e Go em velocidade e facilidade.',
    checa: (t) => { const linhas = t.split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l)); const sep = linhas.some((l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-')); return { ok: sep && linhas.length >= 5, nota: `${linhas.length} linhas de tabela` }; } },
  { id: 'instrucao-3', grupo: 'Instrução', pergunta: 'Liste exatamente 3 dicas para dormir melhor, em tópicos, sem introdução e sem conclusão.',
    checa: (t) => { const ls = t.split('\n').filter((l) => l.trim()); const itens = ls.filter((l) => OPCAO.test(l) && !/^\s{2,}/.test(l)); return { ok: itens.length === 3 && OPCAO.test(ls[0] || ''), nota: `${itens.length} itens${OPCAO.test(ls[0] || '') ? '' : ', com introdução'}` }; } },
  { id: 'instrucao-numero', grupo: 'Instrução', pergunta: 'Responda só com um número: quantos dias tem uma semana?', checa: (t) => ({ ok: /^\s*\**\s*7\s*\**\.?\s*$/.test(t), nota: JSON.stringify(t.trim().slice(0, 20)) }) },
  { id: 'texto-longo', grupo: 'Texto longo', pergunta: `${TEXTO_LONGO}\n\nCom base no texto acima, qual é o código do armário de ferramentas? Responda só com o número.`, checa: contem(/\b7319\b/, '7319') },
  { id: 'identidade', grupo: 'Identidade', pergunta: 'Qual modelo de IA é você? Responda em uma frase.', checa: null },
];

function laco(t) { // a mesma frase de 8 palavras repetida 3 vezes ou mais = laço
  const p = sem(t).split(/\s+/).filter(Boolean); const vistos = new Map(); let pior = 0;
  for (let i = 0; i + 8 <= p.length; i++) { const k = p.slice(i, i + 8).join(' '); const n = (vistos.get(k) || 0) + 1; vistos.set(k, n); pior = Math.max(pior, n); }
  return pior >= 3;
}

async function pergunta(modelo, texto) {
  const cat = LOCAL_MODELS.find((m) => m.id === modelo);
  const idNome = cat.identidade || cat.name; // mesma linha de identidade do app.js
  const systemPrompt = `Plano Grátis. Respostas diretas, sem repetir contexto.\n\n${getPersona()}\n\nIdentidade: você é o ${cat.name} (451sh.com)${idNome !== cat.name ? `, modelo ${idNome}` : ''}. Se perguntarem qual modelo ou IA você é, responda "${idNome}" — nunca o nome do provedor, da infraestrutura ou de outro modelo.`;
  const usage = {};
  const t0 = Date.now(); let primeiroTexto = null, primeiroPensar = null, txt = '', pensar = 0, avisos = [], pro = null;
  let erro = null;
  try {
    for await (const _ of streamChat('chat', { modelId: modelo, messages: [{ role: 'user', content: texto }], systemPrompt, temperature: 0.6, top_p: 0.9, max_tokens: MAX_TOKENS }, {
      onToken: (t) => { if (primeiroTexto == null) primeiroTexto = Date.now() - t0; txt += t; },
      onReasoning: (r) => { if (primeiroPensar == null) primeiroPensar = Date.now() - t0; pensar += r.length; },
      onWarning: (w) => { if (w?.message) avisos.push(w.message); if (w?.type === 'pro_aviso') pro = w.motivo; },
      usage,
    })) { /* tokens via onToken */ }
  } catch (e) { erro = e.message; }
  const total = Date.now() - t0;
  const geracao = (total - (primeiroPensar ?? primeiroTexto ?? total)) / 1000;
  return {
    texto: txt, erro, avisos: [...new Set(avisos)], s_total: total / 1000, s_1o_texto: primeiroTexto != null ? primeiroTexto / 1000 : null,
    s_1o_pensar: primeiroPensar != null ? primeiroPensar / 1000 : null, pensar_chars: pensar,
    tin: usage.input_tokens || 0, tout: usage.output_tokens || 0, tok_s: geracao > 0.5 && usage.output_tokens ? Math.round((usage.output_tokens / geracao) * 10) / 10 : null,
    pro, // marca [PRO] (aviso do Pro) que o modelo deu
    cortada: (usage.output_tokens || 0) >= Math.min(MAX_TOKENS, MODEL_CATALOG.find((m) => m.id === modelo)?.max_out || MAX_TOKENS) - 2 || txt.includes('tempo máximo'),
  };
}

for (const modelo of LISTA.split(',')) {
  const cat = LOCAL_MODELS.find((m) => m.id === modelo);
  const saida = { modelo, nome: cat.name, max_tokens: Math.min(MAX_TOKENS, MODEL_CATALOG.find((m) => m.id === modelo)?.max_out || MAX_TOKENS), inicio: new Date().toISOString(), aquecimento: null, casos: [] };
  console.log(`\n== ${cat.name} ==`);
  saida.aquecimento = await pergunta(modelo, 'Oi! Responda só: tudo certo.');
  console.log(`aquecimento (troca de modelo + prompt frio): ${saida.aquecimento.s_total} s${saida.aquecimento.erro ? ' ERRO ' + saida.aquecimento.erro : ''}`);
  for (const c of CASOS) {
    const r = await pergunta(modelo, c.pergunta);
    const nomeCurto = sem(cat.identidade || cat.name).replace(/\s*\(local\)\s*/, '').trim();
    const v = r.erro ? { ok: false, nota: `erro: ${r.erro}` }
      : c.id === 'identidade' ? { ok: sem(r.texto).includes(nomeCurto) && !/openai|chatgpt|google|deepmind|alibaba|anthropic|claude|meta\b/.test(sem(r.texto)), nota: r.texto.trim().slice(0, 80) }
        : c.checa(r.texto);
    const lang = c.grupo === 'Código' ? { ok: true } : idioma(r.texto);
    const item = { id: c.id, grupo: c.grupo, ok: !!v.ok, nota: v.nota, idioma_pt: lang.ok, laco: laco(r.texto), ...r, texto: r.texto.slice(0, 1500) };
    saida.casos.push(item);
    console.log(`${item.ok ? 'OK ' : 'XX '} ${c.id.padEnd(17)} ${String(item.s_total).padStart(6)} s  1º texto ${String(item.s_1o_texto).padStart(5)} s  ${String(item.tout).padStart(4)} tok ${item.tok_s ?? '-'} tok/s ${item.idioma_pt ? '' : '[NÃO PT] '}${item.laco ? '[LAÇO] ' : ''}${item.cortada ? '[CORTADA] ' : ''}${item.pro ? '[AVISO PRO] ' : ''}${item.nota}`);
  }
  saida.fim = new Date().toISOString();
  writeFileSync(`${OUT}/${modelo.replace(':', '-')}.json`, JSON.stringify(saida, null, 1));
}
process.exit(0);
