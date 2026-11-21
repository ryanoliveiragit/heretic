// Uso por usuário para o painel do dono (21/11). Regra do dono: "nunca as conversas".
// Aqui entram SÓ números de cada mensagem: o nível pedido, se o Claude respondeu, recusou ou falhou,
// qual modelo entregou, tokens, custo, créditos e buscas. Nenhum texto de pergunta ou de resposta.
//   • Pagantes (e o dono) um por um, pelo id da chave (hash, irreversível).
//   • Grátis só em total por dia (sem perfil de visitante), com a contagem de visitantes únicos.
//   • Pagamento confirmado fica guardado sem prazo (os pedidos em pay:order:* somem em 7 dias).
// Mesmo Upstash Redis dos limites; sem Redis, uma memória simples (serve para teste local).

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const hasRedis = () => !!(REST_URL && REST_TOKEN);

const USUARIOS = '451:uso:usuarios';           // zset: id → último uso (ms)
const U = (sid) => `451:uso:u:${sid}`;          // hash com os números do usuário
const DIAS = (sid) => `451:uso:dias:${sid}`;    // set com os dias em que usou
const GRATIS = (dia) => `451:uso:gratis:${dia}`;
const GRATIS_VIS = (dia) => `451:uso:gratis:vis:${dia}`;
const PAGOS = '451:uso:pagos';                  // set com os pedidos já contados
const PAGAMENTOS = '451:uso:pagamentos';        // lista com os últimos pagamentos
// Detalhe por mensagem (dono 21/11, "gastei R$ 0,10 num prompt? em qual modelo?"): só números e nomes
// de modelo, nunca texto. Lista geral com as últimas 500 e, por usuário, as últimas 30 (30 dias).
const MSGS = '451:uso:msgs';
const MSGS_U = (sid) => `451:uso:m:${sid}`;
const GUARDA_MSGS = String(30 * 86400);
const r6 = (v) => Math.round((Number(v) || 0) * 1e6) / 1e6;
// No grátis o id é o IP: no detalhe vai só um apelido (hash com o segredo do servidor), nunca o IP.
function apelido(sid, tier, admin) {
  if (!(tier === 'free' && !admin)) return String(sid).slice(-6);
  let h = 0x811c9dc5;
  for (const ch of `${process.env.ACCESS_SECRET || '451'}|${sid}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').slice(-6);
}
const GUARDA_GRATIS = String(120 * 86400);

// ── armazenamento ──
async function redis(commands) {
  const res = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`uso store ${res.status}`);
  const rows = await res.json();
  return rows.map((row) => { if (row.error) throw new Error(row.error); return row.result; });
}

// Memória para teste local: só os comandos que este arquivo usa.
const mem = new Map();
function memExec([cmd, key, ...a]) {
  const pega = (tipo, novo) => { let v = mem.get(key); if (!v) { v = novo(); mem.set(key, v); } return v; };
  switch (cmd) {
    case 'HINCRBY': { const h = pega('h', () => new Map()); const v = (Number(h.get(a[0])) || 0) + Number(a[1]); h.set(a[0], String(v)); return v; }
    case 'HSET': { const h = pega('h', () => new Map()); for (let i = 0; i < a.length; i += 2) h.set(a[i], String(a[i + 1])); return 1; }
    case 'HSETNX': { const h = pega('h', () => new Map()); if (h.has(a[0])) return 0; h.set(a[0], String(a[1])); return 1; }
    case 'HGETALL': { const h = mem.get(key); return h ? [...h.entries()].flat() : []; }
    case 'SADD': { const s = pega('s', () => new Set()); const n = s.size; a.forEach((x) => s.add(x)); return s.size - n; }
    case 'SCARD': return mem.get(key)?.size || 0;
    case 'PFADD': { const s = pega('s', () => new Set()); const n = s.size; a.forEach((x) => s.add(x)); return s.size > n ? 1 : 0; }
    case 'PFCOUNT': { const u = new Set(); [key, ...a].forEach((k) => (mem.get(k) || []).forEach((x) => u.add(x))); return u.size; }
    case 'ZADD': { const z = pega('z', () => new Map()); const nx = a[0] === 'NX'; const [sc, m] = nx ? a.slice(1) : a; if (nx && z.has(m)) return 0; z.set(m, Number(sc)); return 1; }
    case 'ZREVRANGE': { const z = mem.get(key); if (!z) return []; const l = [...z.entries()].sort((x, y) => y[1] - x[1]).slice(Number(a[0]), Number(a[1]) + 1); return l.flatMap(([m, s]) => [m, String(s)]); }
    case 'LPUSH': { const l = pega('l', () => []); a.forEach((x) => l.unshift(x)); return l.length; }
    case 'LTRIM': { const l = mem.get(key); if (l) l.splice(Number(a[1]) + 1); return 'OK'; }
    case 'LRANGE': { const l = mem.get(key) || []; return l.slice(Number(a[0]), Number(a[1]) + 1); }
    case 'KEYS': { const re = new RegExp('^' + key.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); return [...mem.keys()].filter((k) => re.test(k)); }
    case 'GET': { const v = mem.get(key); return typeof v === 'string' ? v : null; }
    case 'SET': mem.set(key, String(a[0])); return 'OK';
    case 'EXPIRE': return 1;
    default: throw new Error(`comando sem memória: ${cmd}`);
  }
}
async function exec(commands) {
  if (!commands.length) return [];
  if (hasRedis()) return redis(commands);
  return commands.map(memExec);
}
/** Só para teste local: tudo o que está guardado na memória (para provar que nenhum texto entra). */
export const _memoria = () => mem;
/** Só para teste local: grava um pedido como o pay.js grava. */
export async function _gravaPedidoTeste(order) { await exec([['SET', `pay:order:${order.id}`, JSON.stringify(order)]]); }

// ── nomes que o painel mostra ──
const NIVEIS = {
  'zai-org/glm-5.3-flash-uncensored': 'Rapid', 'nousresearch/hermes-4-405b': 'Titan', 'claude-sonnet-5-5': 'Max',
  'hermes-4-405b': 'Hermes', 'kimi-k3.1-pro-uncensored': 'Kimi', 'sao10k/l3.1-euryale-70b': 'Titan',
  'local:qwen35b': 'Qwen 35B local', 'local:gemma26b': 'Gemma 26B local', 'local:gptoss20b': 'gpt-oss-20b Heretic',
};
export const nomeNivel = (modelId) => NIVEIS[modelId] || String(modelId || 'outro').split('/').pop();
const MODELOS = [
  // 21/11: no gateway, o nome antigo local/qwen3-4b-abliterated passou a ser o gpt-oss (padrão da porta 8000).
  [/^local\/qwen3\.6-35b/, 'Qwen 35B local'], [/^local\/gemma-4-26b/, 'Gemma 26B local'], [/^local\/(gpt-oss-20b|qwen3-4b-abliterated)/, 'gpt-oss-20b Heretic'],
  [/claude-sonnet/, 'Claude Sonnet'], [/claude-opus/, 'Claude Opus'], [/claude-haiku/, 'Claude Haiku'],
  [/glm-4\.7/, 'GLM 4.7'], [/glm-5\.3/, 'GLM 5.3'], [/1017-heretic/, 'DeepSeek Heretic'], [/1017-uncensored/, 'DeepSeek 1017'],
  [/deepseek-v4\.1-flash-uncensored/, 'DeepSeek V4.1'], [/dolphin/, 'Dolphin'], [/cydonia/, 'Cydonia'],
  [/kimi/, 'Kimi'], [/hermes/, 'Hermes'], [/gemma/, 'Gemma'],
];
export const nomeModelo = (m) => (m ? (MODELOS.find(([re]) => re.test(m)) || [null, String(m).split('/').pop()])[1] : '');

// ── registro ──
/** Uma mensagem respondida. `usage` vem do streamChat (rota, claude, buscas, tokens). */
export async function registraUso({ sid, tier, admin = false, nivel, usoJusto = false, usage = {}, custo = 0, creditos = 0, fonte = 'site' }) {
  if (!sid) return;
  const agora = Date.now(), dia = new Date(agora).toISOString().slice(0, 10);
  const micro = String(Math.max(0, Math.round((Number(custo) || 0) * 1e6)));
  const entregou = nomeModelo((usage.rota || []).slice(-1)[0]);
  const claude = usage.claude; // 'respondeu' | 'recusou' | 'falhou' | undefined (não passou pelo Claude)
  const buscas = Number(usage.buscas) || 0;
  const cmds = [];
  // Uma linha por mensagem: rota, tokens, cache e a parte de cada chamada paga no custo.
  const partes = (usage.partes || []).map((x) => ({ m: nomeModelo(x.m) || x.m, p: x.p, tin: x.tin || 0, tout: x.tout || 0, cg: x.cg || 0, cl: x.cl || 0, usd: r6(x.usd) }));
  const resto = r6((Number(custo) || 0) - partes.reduce((t, x) => t + x.usd, 0));
  if (resto > 0.000005) partes.push({ m: entregou || '?', p: 'resto', tin: 0, tout: 0, cg: 0, cl: 0, usd: resto });
  const linha = JSON.stringify({
    t: agora, id: apelido(sid, tier, admin), plano: admin ? 'admin' : tier, nivel: `${nivel}${usoJusto ? ' (uso justo)' : ''}`, fonte,
    rota: (usage.rota || []).map(nomeModelo), claude: claude || null, buscas,
    tin: Number(usage.input_tokens) || 0, tout: Number(usage.output_tokens) || 0, cg: Number(usage.cache_gravada) || 0, cl: Number(usage.cache_lida) || 0,
    usd: r6(custo), creditos: Math.round(Number(creditos) || 0), partes,
  });
  cmds.push(['LPUSH', MSGS, linha], ['LTRIM', MSGS, '0', '499']);
  if (!(tier === 'free' && !admin)) cmds.push(['LPUSH', MSGS_U(sid), linha], ['LTRIM', MSGS_U(sid), '0', '29'], ['EXPIRE', MSGS_U(sid), GUARDA_MSGS]);
  if (tier === 'free' && !admin) {
    const k = GRATIS(dia);
    cmds.push(['HINCRBY', k, 'msgs', '1'], ['HINCRBY', k, 'custo_micro', micro]);
    if (entregou) cmds.push(['HINCRBY', k, `e:${entregou}`, '1']);
    if (claude) cmds.push(['HINCRBY', k, `claude:${claude}`, '1']);
    if (claude && claude !== 'respondeu' && entregou) cmds.push(['HINCRBY', k, `d:${entregou}`, '1']);
    if (buscas) cmds.push(['HINCRBY', k, 'buscas', String(buscas)]);
    cmds.push(['EXPIRE', k, GUARDA_GRATIS], ['PFADD', GRATIS_VIS(dia), sid], ['EXPIRE', GRATIS_VIS(dia), GUARDA_GRATIS]);
  } else {
    const k = U(sid), n = `${nivel}${usoJusto ? ' (uso justo)' : ''}`;
    cmds.push(['ZADD', USUARIOS, String(agora), sid],
      ['HSET', k, 'plano', admin ? 'admin' : tier, 'ultimo', String(agora)], ['HSETNX', k, 'primeiro', String(agora)],
      ['HINCRBY', k, 'msgs', '1'], ['HINCRBY', k, 'custo_micro', micro],
      ['HINCRBY', k, `n:${n}`, '1'], ['HINCRBY', k, `c:${n}`, micro],
      ['HINCRBY', k, 'tok_in', String(Number(usage.input_tokens) || 0)], ['HINCRBY', k, 'tok_out', String(Number(usage.output_tokens) || 0)],
      ['SADD', DIAS(sid), dia]);
    if (entregou) cmds.push(['HINCRBY', k, `e:${entregou}`, '1']);
    if (claude) cmds.push(['HINCRBY', k, `claude:${claude}`, '1']);
    if (claude && claude !== 'respondeu' && entregou) cmds.push(['HINCRBY', k, `d:${entregou}`, '1']); // para onde o Claude desceu
    if (creditos) cmds.push(['HINCRBY', k, 'creditos', String(Math.round(creditos))]);
    if (buscas) cmds.push(['HINCRBY', k, 'buscas', String(buscas)]);
    if (usage.cache_lida) cmds.push(['HINCRBY', k, 'cache_lida', String(usage.cache_lida)]);
    if (fonte === 'api') cmds.push(['HINCRBY', k, 'api', '1']);
  }
  await exec(cmds);
}

/** Uma imagem gerada. */
export async function registraImagem({ sid, tier, admin = false, motor, custo = 0, creditos = 0 }) {
  if (!sid) return;
  const agora = Date.now(), dia = new Date(agora).toISOString().slice(0, 10);
  const micro = String(Math.max(0, Math.round((Number(custo) || 0) * 1e6)));
  const linha = JSON.stringify({ t: agora, id: apelido(sid, tier, admin), plano: admin ? 'admin' : tier, imagem: motor, usd: r6(custo), creditos: Math.round(Number(creditos) || 0) });
  await exec([['LPUSH', MSGS, linha], ['LTRIM', MSGS, '0', '499']]);
  if (tier === 'free' && !admin) {
    await exec([['HINCRBY', GRATIS(dia), 'imagens', '1'], ['HINCRBY', GRATIS(dia), 'img_custo_micro', micro], ['EXPIRE', GRATIS(dia), GUARDA_GRATIS],
      ['PFADD', GRATIS_VIS(dia), sid], ['EXPIRE', GRATIS_VIS(dia), GUARDA_GRATIS]]);
    return;
  }
  const k = U(sid);
  const cmds = [['ZADD', USUARIOS, String(agora), sid], ['HSET', k, 'plano', admin ? 'admin' : tier, 'ultimo', String(agora)], ['HSETNX', k, 'primeiro', String(agora)],
    ['HINCRBY', k, 'imagens', '1'], ['HINCRBY', k, `img:${motor}`, '1'], ['HINCRBY', k, 'img_custo_micro', micro], ['SADD', DIAS(sid), dia]];
  if (creditos) cmds.push(['HINCRBY', k, 'creditos', String(Math.round(creditos))]);
  await exec(cmds);
}

/** Pagamento confirmado: fica guardado sem prazo, uma vez por pedido. */
export async function registraPagamento({ id, sid, cents, period, method, expiresAt }) {
  if (!id || !sid) return false;
  const [novo] = await exec([['SADD', PAGOS, String(id)]]);
  if (Number(novo) !== 1) return false; // já contado
  const agora = Date.now(), k = U(sid);
  await exec([
    ['HINCRBY', k, 'pago_cents', String(Math.round(Number(cents) || 0))], ['HINCRBY', k, 'pedidos', '1'],
    ['HSET', k, 'vence', String(expiresAt || ''), 'periodo', String(period || ''), 'metodo', String(method || ''), 'ultimo_pagamento', String(agora)],
    ['HSETNX', k, 'plano', 'pro'], ['HSETNX', k, 'primeiro', String(agora)], ['ZADD', USUARIOS, 'NX', String(agora), sid],
    ['LPUSH', PAGAMENTOS, JSON.stringify({ id, sid, cents: Number(cents) || 0, period, method, ts: agora })], ['LTRIM', PAGAMENTOS, '0', '499'],
  ]);
  return true;
}

// ── leitura para o painel ──
/** Uma linha guardada de mensagem → o que o painel mostra (com reais). */
const leLinha = (fx) => (raw) => {
  let m; try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const r4 = (usd) => Math.round((Number(usd) || 0) * fx * 10000) / 10000; // 4 casas: R$ 0,0042 aparece
  return { ...m, custo_rs: r4(m.usd), partes: (m.partes || []).map((x) => ({ ...x, custo_rs: r4(x.usd) })) };
};
const hashDe = (arr) => { const o = {}; for (let i = 0; i + 1 < (arr || []).length; i += 2) o[arr[i]] = arr[i + 1]; return o; };
const num = (v) => Number(v) || 0;
const porPrefixo = (h, p) => Object.entries(h).filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), num(v)]);

/**
 * Tudo o que o painel mostra. `idDaChave(key)` converte a chave de um pedido no id do assinante
 * (o mesmo hash do teto de gasto), para ligar pagamento e uso sem guardar a chave.
 */
export async function lePainel({ fx = 5.94, idDaChave, dias = 30, diasTotal = 120 } = {}) {
  // Pedidos pagos que ainda estão no banco (7 dias) e não foram contados: conta agora.
  try {
    const chaves = (await exec([['KEYS', 'pay:order:*']]))[0] || [];
    if (chaves.length && idDaChave) {
      const pedidos = await exec(chaves.slice(0, 500).map((k) => ['GET', k]));
      for (const raw of pedidos) {
        let o; try { o = JSON.parse(raw); } catch { continue; }
        if (o && o.status === 'paid' && o.key && o.period !== 'teste') {
          await registraPagamento({ id: o.id, sid: await idDaChave(o.key), cents: o.cents, period: o.period, method: o.method, expiresAt: o.expiresAt });
        }
      }
    }
  } catch (e) { console.error('[painel] pedidos:', e.message); }

  const lista = (await exec([['ZREVRANGE', USUARIOS, '0', '199', 'WITHSCORES']]))[0] || [];
  const sids = []; for (let i = 0; i < lista.length; i += 2) sids.push(lista[i]);
  const brutos = sids.length ? await exec(sids.flatMap((s) => [['HGETALL', U(s)], ['SCARD', DIAS(s)], ['LRANGE', MSGS_U(s), '0', '9']])) : [];
  const rs = (usd) => Math.round(usd * fx * 100) / 100;
  const usuarios = sids.map((sid, i) => {
    const h = hashDe(brutos[3 * i]), diasAtivos = num(brutos[3 * i + 1]);
    const custoUsd = (num(h.custo_micro) + num(h.img_custo_micro)) / 1e6, pagoRs = num(h.pago_cents) / 100;
    const niveis = porPrefixo(h, 'n:').map(([nome, msgs]) => ({ nome, msgs, custo_rs: rs(num(h[`c:${nome}`]) / 1e6) })).sort((a, b) => b.msgs - a.msgs);
    const entregou = porPrefixo(h, 'e:').map(([modelo, msgs]) => ({ modelo, msgs })).sort((a, b) => b.msgs - a.msgs);
    return {
      id: sid.slice(-6), plano: h.plano || 'pro', pago_rs: pagoRs, pedidos: num(h.pedidos), periodo: h.periodo || '', metodo: h.metodo || '',
      vence: num(h.vence) || null, primeiro: num(h.primeiro) || null, ultimo: num(h.ultimo) || null,
      msgs: num(h.msgs), dias_ativos: diasAtivos, media_dia: diasAtivos ? Math.round((num(h.msgs) / diasAtivos) * 10) / 10 : 0,
      imagens: num(h.imagens), buscas: num(h.buscas), api: num(h.api), creditos: num(h.creditos),
      custo_usd: Math.round(custoUsd * 10000) / 10000, custo_rs: rs(custoUsd), lucro_rs: Math.round((pagoRs - custoUsd * fx) * 100) / 100,
      niveis, entregou, desceu_para: porPrefixo(h, 'd:').map(([modelo, msgs]) => ({ modelo, msgs })).sort((a, b) => b.msgs - a.msgs),
      claude: { respondeu: num(h['claude:respondeu']), recusou: num(h['claude:recusou']), falhou: num(h['claude:falhou']) },
      ultimas: (brutos[3 * i + 2] || []).map(leLinha(fx)).filter(Boolean),
    };
  });

  // Grátis: soma por dia (últimos `dias` dias) e visitantes únicos em 7 e 30 dias.
  const hoje = Date.now(), listaDias = [];
  for (let i = 0; i < diasTotal; i++) listaDias.push(new Date(hoje - i * 86400000).toISOString().slice(0, 10));
  const ult = listaDias.slice(0, dias);
  const brutoG = await exec([...listaDias.map((d) => ['HGETALL', GRATIS(d)]), ...ult.map((d) => ['PFCOUNT', GRATIS_VIS(d)]),
    ['PFCOUNT', ...ult.slice(0, 7).map(GRATIS_VIS)], ['PFCOUNT', ...ult.map(GRATIS_VIS)]]);
  const diasG = listaDias.map((dia, i) => {
    const h = hashDe(brutoG[i]);
    return {
      dia, msgs: num(h.msgs), visitantes: i < dias ? num(brutoG[diasTotal + i]) : 0, imagens: num(h.imagens), buscas: num(h.buscas),
      custo_rs: rs((num(h.custo_micro) + num(h.img_custo_micro)) / 1e6),
      claude: { respondeu: num(h['claude:respondeu']), recusou: num(h['claude:recusou']), falhou: num(h['claude:falhou']) },
      entregou: porPrefixo(h, 'e:').map(([modelo, msgs]) => ({ modelo, msgs })),
    };
  });
  const soma = (l) => l.reduce((t, d) => ({
    msgs: t.msgs + d.msgs, imagens: t.imagens + d.imagens, custo_rs: Math.round((t.custo_rs + d.custo_rs) * 100) / 100,
    claude: { respondeu: t.claude.respondeu + d.claude.respondeu, recusou: t.claude.recusou + d.claude.recusou, falhou: t.claude.falhou + d.claude.falhou },
  }), { msgs: 0, imagens: 0, custo_rs: 0, claude: { respondeu: 0, recusou: 0, falhou: 0 } });
  const gratis = {
    semana: { ...soma(diasG.slice(0, 7)), visitantes: num(brutoG[diasTotal + dias]) },
    mes: { ...soma(diasG.slice(0, dias)), visitantes: num(brutoG[diasTotal + dias + 1]) },
    total: soma(diasG),
    dias: diasG.slice(0, dias).filter((d) => d.msgs || d.imagens),
  };

  const pagantes = usuarios.filter((u) => u.plano !== 'admin');
  const recebido = pagantes.reduce((t, u) => t + u.pago_rs, 0);
  const custoPagantes = pagantes.reduce((t, u) => t + u.custo_rs, 0);
  const custoDono = usuarios.filter((u) => u.plano === 'admin').reduce((t, u) => t + u.custo_rs, 0);
  const r2 = (v) => Math.round(v * 100) / 100;
  const pagamentos = ((await exec([['LRANGE', PAGAMENTOS, '0', '19']]))[0] || []).map((r) => {
    try { const p = JSON.parse(r); return { id: String(p.sid || '').slice(-6), valor_rs: num(p.cents) / 100, periodo: p.period, metodo: p.method, quando: p.ts }; } catch { return null; }
  }).filter(Boolean);
  // Últimas mensagens de todo mundo e o custo por modelo nelas (de onde sai cada real).
  const mensagens = ((await exec([['LRANGE', MSGS, '0', '199']]))[0] || []).map(leLinha(fx)).filter(Boolean);
  const porModelo = {};
  for (const m of mensagens) {
    for (const x of m.partes || []) {
      const k = `${x.m}|${x.p}`, a = porModelo[k] || (porModelo[k] = { modelo: x.m, papel: x.p, chamadas: 0, usd: 0, tin: 0, tout: 0, cg: 0, cl: 0 });
      a.chamadas += 1; a.usd += x.usd; a.tin += x.tin; a.tout += x.tout; a.cg += x.cg; a.cl += x.cl;
    }
    if (m.imagem) {
      const k = `${m.imagem}|imagem`, a = porModelo[k] || (porModelo[k] = { modelo: m.imagem, papel: 'imagem', chamadas: 0, usd: 0, tin: 0, tout: 0, cg: 0, cl: 0 });
      a.chamadas += 1; a.usd += m.usd;
    }
  }
  const custoPorModelo = Object.values(porModelo).map((a) => ({ ...a, usd: r6(a.usd), custo_rs: Math.round(a.usd * fx * 10000) / 10000, media_rs: a.chamadas ? Math.round((a.usd / a.chamadas) * fx * 10000) / 10000 : 0 }))
    .sort((a, b) => b.usd - a.usd);
  return {
    geradoEm: Date.now(), cambio: fx,
    mensagens: mensagens.slice(0, 60), custo_por_modelo: custoPorModelo, mensagens_lidas: mensagens.length,
    // Desde o início do registro: recebido e custo dos pagantes. O grátis vai à parte (últimos 30 dias)
    // e o uso do próprio dono (chave de admin) também, porque não tem receita.
    totais: {
      pagantes: pagantes.filter((u) => u.pago_rs > 0).length,
      recebido_rs: r2(recebido),
      custo_pagantes_rs: r2(custoPagantes),
      lucro_pagantes_rs: r2(recebido - custoPagantes),
      custo_gratis_30d_rs: gratis.mes.custo_rs,
      custo_gratis_total_rs: gratis.total.custo_rs,
      custo_dono_rs: r2(custoDono),
      // A resposta para "estou perdendo dinheiro?": tudo o que entrou menos tudo o que o site gastou.
      resultado_rs: r2(recebido - custoPagantes - gratis.total.custo_rs - custoDono),
    },
    usuarios, gratis, pagamentos,
  };
}

// ── preços e saldos para o painel ──
// Mensagem típica medida no site em 21/11: no caminho do Claude, ~7.150 tokens de entrada (7.100 deles
// o prompt fixo, que o cache guarda) e, nos sem censura, ~4.524; saída típica de 600 tokens.
const TIPICA = { claude: 7150, cache: 7100, aberto: 4524, saida: 600 };
const BUSCA_USD = 0.0072;                          // Exa US$ 0,007 por busca + tokens (OpenRouter, 21/11)
const IMAGEM_USD = { 'Z-Image (imagem normal)': 0.0031, 'Chroma (imagem adulta)': 0.0086 };
const LINHAS = [
  ['claude:sonnet-5-5', 'Claude Sonnet 5.5', '1º do Rapid, do Titan e do grátis'],
  ['claude-sonnet-5-5', 'Claude Opus 5.5', '1º do Max'],
  ['zai-org/glm-5.3-flash-uncensored', 'GLM 5.3 sem censura', 'Rapid quando o Claude recusa; uso justo'],
  ['nousresearch/hermes-4-405b', 'DeepSeek 1017 sem censura', 'Titan quando o Claude recusa; grátis depois do freio'],
  ['kimi-k3.1-pro-uncensored', 'Kimi K3.1 Pro', 'pago com créditos'],
  ['hermes-4-405b', 'Hermes 4 405B', 'pago com créditos'],
  ['cognitivecomputations/dolphin-mistral-24b-venice-edition', 'Dolphin 24B', 'reserva quando a OpenUncensored cai'],
];
/** Quanto custa uma mensagem típica em cada modelo, os planos e o crédito (tudo do catálogo atual). */
export function tabelaPrecos(catalogo, periodos, fx = 5.94) {
  const rs = (usd) => Math.round(usd * fx * 10000) / 10000;
  const modelos = [];
  for (const [id, nome, uso] of LINHAS) {
    const m = (catalogo || []).find((x) => x.id === id);
    if (!m) continue;
    const claude = m.provider === 'anthropic';
    const semCache = claude ? (TIPICA.claude * m.price_in + TIPICA.saida * m.price_out) / 1e6 : (TIPICA.aberto * m.price_in + TIPICA.saida * m.price_out) / 1e6;
    const comCache = claude && m.price_cache_read != null
      ? (TIPICA.cache * m.price_cache_read + (TIPICA.claude - TIPICA.cache) * m.price_in + TIPICA.saida * m.price_out) / 1e6 : null;
    modelos.push({ nome, uso, entrada_usd_milhao: m.price_in, saida_usd_milhao: m.price_out, msg_rs: rs(comCache ?? semCache), msg_sem_cache_rs: comCache != null ? rs(semCache) : null });
  }
  const extras = [{ nome: 'Busca na web', uso: 'quando a pergunta pede', msg_rs: rs(BUSCA_USD) },
    ...Object.entries(IMAGEM_USD).map(([nome, usd]) => ({ nome, uso: 'por imagem', msg_rs: rs(usd) }))];
  const planos = Object.entries(periodos || {}).filter(([, v]) => !v.hidden)
    .map(([nome, v]) => ({ nome, preco_rs: v.cents / 100, dias: v.days, por_mes_rs: Math.round((v.cents / 100) / Math.max(1, Math.round(v.days / 30)) * 100) / 100 }));
  return { modelos, extras, planos, credito: { preco_rs: 0.01, margem: 'o 451 cobra 2× o custo do provedor' }, mensagem_tipica: TIPICA };
}

// Saldos das chaves, lidos ao vivo (a Anthropic não mostra saldo pela API). Guarda 5 minutos.
let _saldos = { em: 0, v: null };
export async function saldosChaves() {
  if (_saldos.v && Date.now() - _saldos.em < 5 * 60 * 1000) return _saldos.v;
  const pega = async (url, opt, ler) => {
    try {
      const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const v = ler(await r.json());
      return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
    } catch { return null; }
  };
  const orAuth = { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } };
  const [ou, or, rp, orChave] = await Promise.all([
    process.env.OU_API_KEY ? pega('https://api.openuncensored.com/v1/credits', { headers: { Authorization: `Bearer ${process.env.OU_API_KEY}` } }, (j) => Number(j?.data?.remaining_usd)) : null,
    process.env.OPENROUTER_API_KEY ? pega('https://openrouter.ai/api/v1/credits', orAuth, (j) => Number(j?.data?.total_credits) - Number(j?.data?.total_usage)) : null,
    process.env.RUNPOD_API_KEY ? pega('https://api.runpod.io/graphql', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: 'query { myself { clientBalance } }' }) }, (j) => Number(j?.data?.myself?.clientBalance)) : null,
    // A chave do site pode não ter permissão de ler o saldo da conta: aí vale o limite da própria chave.
    process.env.OPENROUTER_API_KEY ? fetch('https://openrouter.ai/api/v1/key', { ...orAuth, signal: AbortSignal.timeout(5000) })
      .then(async (r) => ({ status: r.status, d: r.ok ? (await r.json())?.data : null })).catch(() => ({ status: 0, d: null })) : null,
  ]);
  const orInfo = orChave ? { status: orChave.status, limite_restante_usd: orChave.d?.limit_remaining ?? null, gasto_da_chave_usd: orChave.d?.usage ?? null } : null;
  _saldos = { em: Date.now(), v: { openuncensored_usd: ou, openrouter_usd: or ?? (orInfo?.limite_restante_usd ?? null), openrouter_chave: orInfo, runpod_usd: rp, claude_usd: null } };
  return _saldos.v;
}
