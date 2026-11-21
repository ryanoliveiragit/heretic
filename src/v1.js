// Camada compatível com OpenAI (/v1) — para usar a chave 451 em clientes como o opencode,
// Cursor, LibreChat, SDK da OpenAI, etc. Só Pro e Pro Plus (dono 19/11): a chave é a MESMA que
// destrava o Pro no site, enviada em Authorization: Bearer <chave>. O grátis não tem API.
//
// Reaproveita o resto do servidor: controle de plano (planForKey), limites por janela (consumeQuota),
// créditos de Hermes/Kimi (spendCredits), freio (throttle), teto global (checkGlobalBudget) e a
// camada anti-recusa FORÇA TUDO (streamChat). A resposta sai no formato OpenAI (streaming e normal).
//
// 19/11 (fix de ferramentas): o cliente mandava `tools`, esta camada descartava, e o modelo respondia
// a chamada como TEXTO (marcação DSML) em vez de devolver `tool_calls` — no cliente a chamada não
// executava e o markup aparecia na tela. Agora `tools`/`tool_choice` vão para o modelo, as chamadas
// voltam estruturadas, `role: "tool"` é aceito e a marcação DSML é removida do texto e do raciocínio.

import { Hono } from 'hono';
import { planForKey, isAdminKey } from './plans.js';
import { getPersona } from './persona.js';
import { agentPrompt } from './agents.js';
import { streamChat, MODEL_CATALOG, enhancePrompt, custoTurno } from './upstream.js';
import { registraUso, nomeNivel } from './uso.js';
import { bucketOf, subjectsFor, consumeQuota, refundQuota, spendStatus, addSpend } from './limits.js';
import { checkGlobalBudget, recordCost } from './cost.js';
import { creditBalance, spendCredits, priceCredits, tetoDeCreditos, throttle, MIN_TO_START, THROTTLE_SECONDS, THROTTLE_PRO_SECONDS } from './credits.js';
import { cortaHistorico, caracteresDe, PRO_MAX_INPUT_CHARS } from './entrada.js';

export const v1 = new Hono();

// Identidade certa na API: o modelo responde por esta camada, não pela infraestrutura de trás.
// A identidade mora na persona (regra do dono 20/11): aqui só entra o contexto da API, sem
// repetir nem contradizer "sem censura". Antes este bloco dizia "modelos abertos sobre a
// OpenUncensored" e o Max (Claude) respondia diferente do chat do site.
const IDENTITY = 'Contexto técnico: você atende pela API do 451 (451sh.com). Se perguntarem qual modelo ou IA você é, responda o nome 451 informado nesta conversa — nunca o nome do provedor, da infraestrutura ou de outro modelo.';

// Ids públicos da API (dono 19/11): canônico = 451-<modelo>-uncensored; o id curto antigo (451-titan)
// segue valendo como alias. Nome de exibição não muda.
const API_MODELS = [
  { id: '451-rapid-uncensored',  alias: '451-rapid',  internal: 'zai-org/glm-5.3-flash-uncensored', name: '451 Rapid' },
  { id: '451-titan-uncensored',  alias: '451-titan',  internal: 'nousresearch/hermes-4-405b',       name: '451 Titan' },
  { id: '451-max-uncensored',    alias: '451-max',    internal: 'claude-sonnet-5-5',                name: '451 Max' },
  { id: '451-hermes-uncensored', alias: '451-hermes', internal: 'hermes-4-405b',                    name: '451 Hermes' },
  { id: '451-kimi-uncensored',   alias: '451-kimi',   internal: 'kimi-k3.1-pro-uncensored',         name: '451 Kimi' },
];
// Canônico e alias (ambos aceitos) → id interno.
const BY_PUBLIC = Object.fromEntries(API_MODELS.flatMap(m => [[m.id, m.internal], [m.alias, m.internal]]));
// Interno → id canônico (o -uncensored), usado na resposta.
const PUBLIC_BY_INTERNAL = Object.fromEntries(API_MODELS.map(m => [m.internal, m.id]));

/** Resolve o modelo pedido (id canônico, alias, id interno ou "451 Titan"/"titan") para o id interno, ou null. */
function resolveApiModel(requested) {
  if (!requested) return BY_PUBLIC['451-titan'];
  const r = String(requested).trim();
  if (BY_PUBLIC[r]) return BY_PUBLIC[r];
  if (MODEL_CATALOG.some(m => m.id === r) && PUBLIC_BY_INTERNAL[r]) return r;
  // aceita "451 Titan", "titan" ou "451-titan-uncensored"
  const low = r.toLowerCase().replace(/\s+/g, '-').replace(/-uncensored$/, '').replace(/^451-?/, '451-');
  if (BY_PUBLIC[low]) return BY_PUBLIC[low];
  return null;
}

/** Chave no header Authorization: Bearer <chave>. */
function apiKeyFrom(c) {
  const h = c.req.header('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

const oaErr = (c, status, message, code) =>
  c.json({ error: { message, type: status === 401 ? 'invalid_request_error' : 'invalid_request_error', code: code || null } }, status);

/** Autentica: devolve { key, tier } para Pro/Plus, ou envia erro 401. */
function auth(c) {
  const key = apiKeyFrom(c);
  const tier = planForKey(key); // 'pro' | 'plus' | null
  if (!key || (tier !== 'pro' && tier !== 'plus')) return { error: oaErr(c, 401, 'Chave inválida ou sem plano Pro. A API do 451 é exclusiva de Pro e Pro Plus.', 'invalid_api_key') };
  return { key, tier, admin: isAdminKey(key) };
}

const now = () => Math.floor(Date.now() / 1000);
const rid = () => 'chatcmpl-' + Math.random().toString(36).slice(2, 10) + now().toString(36);

// ── Filtro da marcação DSML ──
// O modelo (DeepSeek) às vezes repete a chamada de ferramenta em texto, com a marcação DSML e até com
// espaços nos delimitadores (`< |DSML | invoke …>`). Como a chamada já vai estruturada, o bloco é
// redundante: este filtro remove as tags e o miolo do bloco, mantendo o texto normal (inclusive HTML).
function dsmlScrubber(emit) {
  let buf = '';
  let inBlock = false;
  const isTag = /^<\s*\|?\s*\/?\s*DSML\s*\|/i;
  const partial = /^<\s*\|?\s*(D(S(M(L)?)?)?)?$/i;
  const take = (n) => { const s = buf.slice(0, n); buf = buf.slice(n); return s; };

  const run = () => {
    while (buf) {
      const i = buf.indexOf('<');
      if (i < 0) { if (!inBlock) emit(buf); buf = ''; return; }
      if (i > 0) { if (!inBlock) emit(take(i)); else take(i); continue; }
      if (!isTag.test(buf)) {
        if (partial.test(buf) && buf.length < 12) return; // pode ser começo de tag: espera
        if (!inBlock) emit('<');
        take(1);
        continue;
      }
      const end = buf.indexOf('>');
      if (end < 0) { if (buf.length < 200) return; if (!inBlock) emit(take(1)); continue; }
      const tag = buf.slice(0, end + 1).replace(/\s+/g, '').toUpperCase();
      take(end + 1);
      const closing = tag.startsWith('</') || tag.includes('|/');
      if (/INVOKE/.test(tag)) inBlock = !closing;
      else if (!inBlock && /^<\S*?\/(CALLS|DSML)>$/.test(tag)) inBlock = false;
    }
  };
  return {
    push(t) { if (!t) return; buf += t; run(); },
    end() { if (buf && !inBlock) emit(buf); buf = ''; inBlock = false; },
  };
}

// Mensagens no formato OpenAI → formato que o streamChat entende, sem perder ferramentas.
function toChat(messages) {
  const sysParts = [];
  const chat = [];
  const callNames = new Map(); // tool_call_id → nome (o modelo precisa do nome no resultado)
  for (const m of messages) {
    const role = m && m.role;
    if (!m) continue;
    if (role === 'system' || role === 'developer') {
      const text = typeof m.content === 'string' ? m.content
        : Array.isArray(m.content) ? m.content.map(p => (typeof p === 'string' ? p : p?.text || '')).join('') : '';
      if (text) sysParts.push(text);
      continue;
    }
    if (role === 'tool') {
      const text = typeof m.content === 'string' ? m.content
        : Array.isArray(m.content) ? m.content.map(p => (typeof p === 'string' ? p : p?.text || '')).join('') : '';
      chat.push({ role: 'tool', tool_call_id: m.tool_call_id || '', name: m.name || callNames.get(m.tool_call_id) || '', content: text });
      continue;
    }
    const text = typeof m.content === 'string' ? m.content
      : Array.isArray(m.content) ? m.content.map(p => (typeof p === 'string' ? p : p?.text || '')).join('') : '';
    if (role === 'assistant') {
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
      for (const c of calls) if (c?.id && c?.function?.name) callNames.set(c.id, c.function.name);
      chat.push({ role: 'assistant', content: text || '', ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      chat.push({ role: 'user', content: text });
    }
  }
  return { sysParts, chat };
}

// ── GET /v1/models ──
v1.get('/models', (c) => {
  const a = auth(c);
  if (a.error) return a.error;
  return c.json({
    object: 'list',
    data: API_MODELS.map(m => ({ id: m.id, object: 'model', created: 1730000000, owned_by: '451', name: m.name })),
  });
});

// ── POST /v1/agent/refine ── (o Afinador: reescreve o pedido e devolve { refined })
// Só Pro/Plus. body: { text | prompt }. Usado pelo app (botão Agente) e por clientes externos.
v1.post('/agent/refine', async (c) => {
  const a = auth(c);
  if (a.error) return a.error;
  let body = {};
  try { body = await c.req.json(); } catch { return oaErr(c, 400, 'Corpo inválido: envie JSON.', 'invalid_body'); }
  const text = String(body.text ?? body.prompt ?? '').trim();
  if (!text) return oaErr(c, 400, 'text é obrigatório.', 'invalid_request');
  const subjects = await subjectsFor({ plan: 'pro', proKey: a.key, visitorIds: [] });
  if (!a.admin && !(await throttle(subjects[0].id, THROTTLE_PRO_SECONDS))) return oaErr(c, 429, `Muitas chamadas: espere ${THROTTLE_PRO_SECONDS}s.`, 'rate_limit');
  const usage = {};
  const refined = await enhancePrompt('chat', text, undefined, usage).catch(() => '');
  const cat = MODEL_CATALOG.find(m => m.id === 'zai-org/glm-5.3-flash-uncensored');
  const cost = custoTurno(usage, cat);
  if (cost > 0) await recordCost(cost).catch(() => {});
  return c.json({ refined: refined || text, changed: !!refined && refined !== text });
});

// ── POST /v1/chat/completions ──
v1.post('/chat/completions', async (c) => {
  const inicioV1 = Date.now(); // painel (21/11): tempo do pedido
  const a = auth(c);
  if (a.error) return a.error;
  const { key, tier, admin } = a;

  let body = {};
  try { body = await c.req.json(); } catch { return oaErr(c, 400, 'Corpo inválido: envie JSON.', 'invalid_body'); }
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) return oaErr(c, 400, 'messages é obrigatório.', 'invalid_request');

  let modelId = resolveApiModel(body.model);
  if (!modelId) return oaErr(c, 404, `Modelo desconhecido: ${body.model}. Use GET /v1/models para ver os disponíveis.`, 'model_not_found');
  let bucket = bucketOf(modelId, tier);
  const stream = body.stream === true;

  // Teto global do provedor (mês/saldo).
  const gb = await checkGlobalBudget();
  // Administrador passa do teto mensal; só para se o saldo do provedor acabar de verdade.
  if (!gb.ok && !(admin && gb.reason === 'monthly_budget')) return oaErr(c, 402, gb.reason === 'monthly_budget' ? 'Teto mensal do provedor atingido.' : 'Saldo do provedor acabou.', 'budget');

  // Sujeito = a própria chave (mesma cota/créditos do app). Freio por chave.
  const subjects = await subjectsFor({ plan: 'pro', proKey: key, visitorIds: [] });
  if (!admin && !(await throttle(subjects[0].id, THROTTLE_PRO_SECONDS))) return oaErr(c, 429, `Muitas chamadas: espere ${THROTTLE_PRO_SECONDS}s entre uma mensagem e outra.`, 'rate_limit');

  // Hermes/Kimi: precisa de créditos, e o pior caso tem de caber no saldo (nunca fica negativo, 21/11).
  let limiteSaida = null;
  if (bucket === 'credits') {
    const bal = await creditBalance(subjects[0].id, tier);
    const cat = MODEL_CATALOG.find(m => m.id === modelId);
    const teto = cat ? tetoDeCreditos({ saldo: bal.total, precoEntrada: cat.price_in, precoSaida: cat.price_out, tokensEntrada: Math.ceil(caracteresDe(messages) / 3.5) + 5000, saidaPedida: Math.min(Number(body.max_tokens) || 4096, 8192) }) : { ok: true, maxSaida: null };
    if (!teto.ok) return oaErr(c, 402, `Esta mensagem pode custar até ${teto.precisa} créditos e o saldo é ${bal.total}. Rapid, Titan e Max seguem no uso justo do Pro.`, 'no_credits');
    limiteSaida = teto.maxSaida;
    if (bal.total < MIN_TO_START) return oaErr(c, 402, 'Sem créditos para Hermes/Kimi. Rapid, Titan e Max seguem no uso justo do Pro.', 'no_credits');
  }

  // Administrador: sem cota de mensagens nem teto de gasto (chargesFor vazio = nada a reservar ou devolver).
  const chargesFor = (b) => (admin ? [] : [{ resource: 'messages', bucket: b }]);
  // Teto por custo real (dono 20/11): mesmo contador do app (por chave).
  if (!admin && bucket === 'pro' && (await spendStatus(subjects, 'pro').catch(() => ({}))).blocked) {
    modelId = BY_PUBLIC['451-rapid']; bucket = 'pro_rapid';
  }
  if (!admin && bucket === 'pro_rapid' && (await spendStatus(subjects, 'pro_rapid').catch(() => ({}))).blocked) {
    return oaErr(c, 429, 'Uso justo do Pro atingido nesta janela. Hermes e Kimi seguem com créditos.', 'fair_use_cap');
  }
  let reserved = admin ? { ok: true, quotas: [] } : await consumeQuota(subjects, chargesFor(bucket));
  // Uso justo: passou do teto diário nos modelos 451 → segue no Rapid.
  if (!reserved.ok && bucket === 'pro' && reserved.quota?.resource === 'messages') {
    modelId = BY_PUBLIC['451-rapid']; bucket = 'pro_rapid';
    reserved = await consumeQuota(subjects, chargesFor(bucket));
  }
  if (!reserved.ok) return oaErr(c, 429, 'Limite de uso atingido. Tente mais tarde.', 'rate_limit');

  // Monta o prompt: o MESMO do chat do site (plano + persona + agente + identidade), para o modelo
  // responder igual aqui e lá. Antes a API montava só persona + IDENTITY + idLine, sem o plano e
  // sem o prompt de agente — e o Max respondia diferente do chat (dono 20/11).
  const parsed = toChat(messages);
  // Pro também tem teto de entrada (21/11): 200 mil caracteres, os mais recentes. Ver src/entrada.js.
  const chat = cortaHistorico(parsed.chat, PRO_MAX_INPUT_CHARS);
  const publicId = PUBLIC_BY_INTERNAL[modelId] || body.model || '451-titan';
  const modeloNome = API_MODELS.find(m => m.id === publicId)?.name || '451';
  const planLine = `Plano ${tier === 'plus' ? 'Pro Plus' : 'Pro'}. Respostas diretas, sem repetir contexto.`;
  const idLine = `Identidade: você é o ${modeloNome} (451sh.com). Se perguntarem qual modelo ou IA você é, responda "${modeloNome}" — nunca o nome do provedor, da infraestrutura ou de outro modelo.`;
  const agent = agentPrompt(body.agent);
  const systemPrompt = [planLine, getPersona(), agent, IDENTITY, idLine, ...parsed.sysParts].filter(Boolean).join('\n\n');
  const cap = Math.min(Number(body.max_tokens) || 4096, 8192);
  const tools = Array.isArray(body.tools) ? body.tools.filter(t => t && t.function && t.function.name) : [];
  // Raciocínio (baixo/médio/alto): aceita o campo do próprio app (effort) ou o padrão OpenAI (reasoning_effort).
  const effortNorm = { baixo: 'baixo', low: 'baixo', medio: 'medio', medium: 'medio', alto: 'alto', high: 'alto' }[String(body.effort || body.reasoning_effort || '').toLowerCase()] || null;
  const params = {
    temperature: body.temperature ?? 0.6,
    top_p: body.top_p ?? 0.9,
    max_tokens: cap,
    frequency_penalty: body.frequency_penalty ?? 0.4,
    presence_penalty: body.presence_penalty ?? 0.1,
    ...(tools.length ? { tools, ...(body.tool_choice ? { tool_choice: body.tool_choice } : {}) } : {}),
    ...(effortNorm ? { effort: effortNorm } : {}),
  };
  if (limiteSaida) params.max_tokens = Math.min(params.max_tokens, limiteSaida);

  const usage = {};
  let doneId = modelId; // o roteador/escalada pode trocar o modelo que responde
  const settleCost = async (text) => {
    const cat = MODEL_CATALOG.find(m => m.id === doneId);
    // 21/11: soma TODAS as chamadas do turno (Opus que recusou + o sem censura que entregou).
    const cost = custoTurno(usage, cat);
    if (cost > 0) await recordCost(cost).catch(() => {});
    const doneBucket = bucketOf(doneId, tier);
    if (!admin && text && (doneBucket === 'pro' || doneBucket === 'pro_rapid')) await addSpend(subjects, doneBucket, cost).catch(() => {});
    if (doneBucket === 'credits' && text) await spendCredits(subjects[0].id, tier, priceCredits(cost)).catch(() => {});
    // Painel do dono (21/11): só os números desta resposta, nunca o texto.
    if (text) await registraUso({ sid: subjects[0]?.id, tier, admin, nivel: nomeNivel(modelId), usoJusto: bucket === 'pro_rapid', usage, custo: cost, ms: Date.now() - inicioV1, creditos: doneBucket === 'credits' ? priceCredits(cost) : 0, fonte: 'api' }).catch(() => {});
    if (!text && !admin) await refundQuota(subjects, chargesFor(bucket)).catch(() => {});
    return {
      prompt_tokens: Number(usage.input_tokens) || 0,
      completion_tokens: Number(usage.output_tokens) || 0,
      total_tokens: (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0),
    };
  };

  // Afinador ("agent": true): reescreve o último pedido do usuário antes de responder.
  // Com ferramentas o Afinador atrapalha (reescreve o pedido e o modelo perde o fio): só roda sem tools.
  if (body.agent === true && !tools.length) {
    const lui = chat.map(m => m.role).lastIndexOf('user');
    if (lui >= 0 && typeof chat[lui].content === 'string') {
      const better = await enhancePrompt('chat', chat[lui].content, undefined, usage).catch(() => '');
      if (better && better !== chat[lui].content.trim()) chat[lui] = { ...chat[lui], content: better };
    }
  }

  // Claude na frente (dono 21/11): a API é só do Pro; o uso justo (pro_rapid) e Kimi/Hermes ficam sem Claude.
  const payload = { messages: chat, systemPrompt, modelId, ...params, creditsOk: bucket === 'credits', claudeFirst: bucket === 'pro' };

  // ── streaming (formato chat.completion.chunk) ──
  if (stream) {
    const id = rid(), created = now();
    const ac = new AbortController();
    let full = '';
    let finish = 'stop';
    const calls = []; // chamadas de ferramenta acumuladas (índice → { id, name, args })
    const bodyStream = new ReadableStream({
      async start(ctrl) {
        const enc = new TextEncoder();
        const send = (obj) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        const base = { id, object: 'chat.completion.chunk', created, model: publicId };
        const delta = (d, reason = null) => send({ ...base, choices: [{ index: 0, delta: d, finish_reason: reason }] });
        delta({ role: 'assistant' });
        // Texto e raciocínio passam pelo mesmo filtro: a marcação DSML sai da tela.
        const textScrub = dsmlScrubber((t) => { full += t; delta({ content: t }); });
        const thinkScrub = dsmlScrubber((t) => delta({ reasoning_content: t }));
        try {
          const handlers = {
            onToken: (t) => textScrub.push(t),
            onReasoning: (t) => thinkScrub.push(t),
            onToolCall: (d) => {
              const i = Number(d.index) || 0;
              const slot = calls[i] || (calls[i] = { id: '', name: '', args: '' });
              if (d.id) slot.id = d.id;
              if (d.name) slot.name = d.name;
              if (d.args) slot.args += d.args;
              delta({ tool_calls: [{ index: i, ...(d.id ? { id: d.id, type: 'function' } : {}), function: { ...(d.name ? { name: d.name } : {}), ...(d.args ? { arguments: d.args } : {}) } }] });
            },
            onWarning: (w) => {
              if (!w) return;
              if (w.to) doneId = w.to; // roteador/escalada mudaram quem responde de fato
              // Recusa cortada: o cliente limpa o que já apareceu e o texto recomeça.
              if (w.type === 'refusal_forced') {
                full = '';
                for (const k in calls) delete calls[k];
                send({ ...base, choices: [{ index: 0, delta: { content: '' }, finish_reason: null }], reset: true });
              }
            },
            signal: ac.signal, usage,
          };
          for await (const _ of streamChat('chat', payload, handlers)) { /* tokens via onToken */ }
          textScrub.end(); thinkScrub.end();
          if (calls.length) finish = 'tool_calls';
          delta({}, finish);
          await settleCost(full || (calls.length ? 'tool' : ''));
          ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
        } catch (e) {
          if (!full && !calls.length) await refundQuota(subjects, chargesFor(bucket)).catch(() => {});
          send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], error: { message: e.message } });
          ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
        } finally { ctrl.close(); }
      },
      cancel() { ac.abort(); },
    });
    return new Response(bodyStream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' } });
  }

  // ── não-streaming ──
  // O Edge da Vercel exige o 1º byte em até 25 s, mas aceita transmitir até 300 s.
  // Se a resposta sai em até 20 s, devolve normal (status certo). Se demora mais,
  // abre a resposta com 200 e manda espaços (JSON aceita espaço antes do objeto)
  // a cada 10 s até o JSON final ficar pronto.
  const gen = (async () => {
    let full = '';
    let think = '';
    const calls = [];
    try {
      const textScrub = dsmlScrubber((t) => { full += t; });
      const thinkScrub = dsmlScrubber((t) => { think += t; });
      const handlers = {
        onToken: (t) => textScrub.push(t),
        onReasoning: (t) => thinkScrub.push(t),
        onToolCall: (d) => {
          const i = Number(d.index) || 0;
          const slot = calls[i] || (calls[i] = { id: '', name: '', args: '' });
          if (d.id) slot.id = d.id;
          if (d.name) slot.name = d.name;
          if (d.args) slot.args += d.args;
        },
        onWarning: (w) => { if (!w) return; if (w.to) doneId = w.to; if (w.type === 'refusal_forced') { full = ''; calls.length = 0; } },
        usage,
      };
      for await (const _ of streamChat('chat', payload, handlers)) { /* drena */ }
      textScrub.end(); thinkScrub.end();
    } catch (e) {
      await refundQuota(subjects, chargesFor(bucket)).catch(() => {});
      return { status: 502, body: { error: { message: 'Falha ao gerar a resposta: ' + e.message, type: 'invalid_request_error', code: 'upstream_error' } } };
    }
    const u = await settleCost(full || (calls.length ? 'tool' : ''));
    const message = { role: 'assistant', content: full || (calls.length ? null : '') };
    if (think) message.reasoning_content = think;
    if (calls.length) {
      message.tool_calls = calls.map((s, i) => ({ id: s.id || `call_${now()}${i}`, type: 'function', function: { name: s.name, arguments: s.args || '{}' } }));
    }
    return { status: 200, body: {
      id: rid(), object: 'chat.completion', created: now(), model: publicId,
      choices: [{ index: 0, message, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
      usage: u,
    } };
  })();

  const WAIT_MS = 20000;
  let timer;
  const early = await Promise.race([gen, new Promise((r) => { timer = setTimeout(() => r(null), WAIT_MS); })]);
  clearTimeout(timer);
  if (early) return c.json(early.body, early.status);

  const enc = new TextEncoder();
  const slow = new ReadableStream({
    async start(ctrl) {
      ctrl.enqueue(enc.encode(' '));
      const beat = setInterval(() => { try { ctrl.enqueue(enc.encode(' ')); } catch { /* fechado */ } }, 10000);
      try {
        const r = await gen;
        ctrl.enqueue(enc.encode(JSON.stringify(r.body)));
      } finally { clearInterval(beat); ctrl.close(); }
    },
  });
  return new Response(slow, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } });
});
