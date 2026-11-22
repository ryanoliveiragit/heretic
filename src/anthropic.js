// API compatível com a Anthropic (/v1/messages) — para usar o 451 no Claude Code (e em qualquer cliente do SDK da
// Anthropic) trocando só a URL base (ANTHROPIC_BASE_URL=https://451sh.com/api) e a chave (ANTHROPIC_API_KEY).
//
// Grátis (dono 22/11, "todos os testes no plano gratuito"): sem uma chave Pro válida, responde o modelo LOCAL
// (gpt-oss), custo zero, com freio por aparelho. Na API o grátis NUNCA sobe pro GLM (sem bump): fila cheia espera ou
// falha, nunca gasta. Pro/Plus (com a chave do 451): os modelos pagos, com os mesmos tetos de gasto do app.
//
// Traduz o formato Anthropic (messages/system/tools, blocos text|tool_use|tool_result) para o streamChat interno e
// devolve no formato Anthropic (eventos message_start, content_block_*, message_delta, message_stop; ou o objeto final).
import { streamChat, MODEL_CATALOG, custoTurno } from './upstream.js';
import { planForKey, isAdminKey, localLiberado } from './plans.js';
import { throttle, THROTTLE_SECONDS, THROTTLE_PRO_SECONDS } from './credits.js';
import { checkGlobalBudget, recordCost } from './cost.js';
import { subjectsFor, spendStatus, addSpend } from './limits.js';
import { registraUso, nomeNivel } from './uso.js';

// Modelos públicos aceitos no campo "model" (o cliente manda o que quiser; sem chave Pro, cai no local de qualquer jeito).
const POR_NOME = {
  '451-rapid': 'zai-org/glm-5.3-flash-uncensored', '451-titan': 'nousresearch/hermes-4-405b',
  '451-max': 'claude-sonnet-5-5', '451-free': 'local',
};
function resolveModelo(pedido, podePago) {
  const r = String(pedido || '').toLowerCase().replace(/\s+/g, '-').replace(/-uncensored$/, '');
  const alvo = POR_NOME[r] || (MODEL_CATALOG.some((m) => m.id === pedido) ? pedido : null);
  if (!podePago) return localLiberado() || null;      // grátis: sempre o local
  if (!alvo || alvo === 'local') return 'claude-sonnet-5-5'; // Pro sem modelo claro → 451 Max
  return alvo;
}

const anthErr = (status, type, message) => Response.json({ type: 'error', error: { type, message } }, { status });
const chaveDe = (c) => c.req.header('x-api-key') || (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '') || '';
const textoBloco = (conteudo) => (typeof conteudo === 'string' ? conteudo
  : Array.isArray(conteudo) ? conteudo.map((b) => (typeof b === 'string' ? b : b?.type === 'text' ? b.text || '' : b?.type === 'tool_result' ? textoBloco(b.content) : '')).join('') : String(conteudo ?? ''));

// system do formato Anthropic (string ou blocos) → texto.
function sistemaDe(system) {
  if (!system) return '';
  if (typeof system === 'string') return system;
  return (Array.isArray(system) ? system : []).map((b) => (typeof b === 'string' ? b : b?.text || '')).join('\n');
}
// messages do formato Anthropic → formato interno do streamChat, sem perder as ferramentas.
function mensagensDe(messages) {
  const chat = [];
  for (const m of messages || []) {
    const blocos = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content ?? '') }];
    if (m.role === 'assistant') {
      let texto = ''; const calls = [];
      for (const b of blocos) {
        if (b.type === 'text') texto += b.text || '';
        else if (b.type === 'tool_use') calls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } });
      }
      chat.push({ role: 'assistant', content: texto, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      let texto = '';
      for (const b of blocos) {
        if (b.type === 'tool_result') chat.push({ role: 'tool', tool_call_id: b.tool_use_id || '', content: textoBloco(b.content) });
        else if (b.type === 'text') texto += b.text || '';
      }
      if (texto) chat.push({ role: 'user', content: texto });
    }
  }
  return chat;
}
// tools do formato Anthropic (name/description/input_schema) → formato OpenAI/interno (function/parameters).
const ferramentasDe = (tools) => (Array.isArray(tools) ? tools : []).filter((t) => t && t.name)
  .map((t) => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } } }));

const idMsg = () => 'msg_' + Math.random().toString(36).slice(2, 12);
const idTool = () => 'toolu_' + Math.random().toString(36).slice(2, 12);

export async function anthropicMessages(c) {
  let body;
  try { body = await c.req.json(); } catch { return anthErr(400, 'invalid_request_error', 'Corpo inválido: envie JSON.'); }
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) return anthErr(400, 'invalid_request_error', 'messages é obrigatório.');

  const chave = chaveDe(c);
  const tier = planForKey(chave);                 // 'pro' | 'plus' | null
  const podePago = tier === 'pro' || tier === 'plus';
  const admin = isAdminKey(chave);
  const modelId = resolveModelo(body.model, podePago);
  if (!modelId) return anthErr(503, 'api_error', 'O modelo grátis do 451 está fora do ar agora.');
  const ehLocal = String(modelId).startsWith('local:');
  if (!ehLocal && (modelId === 'hermes-4-405b' || modelId === 'kimi-k3.1-pro-uncensored'))
    return anthErr(400, 'invalid_request_error', 'Hermes e Kimi (créditos) ainda não estão na API Anthropic. Use 451-rapid, 451-titan ou 451-max.');

  // Freio: Pro por chave; grátis por aparelho (IP + cliente). Evita martelar.
  const ipc = `${c.req.header('x-forwarded-for') || ''}|${c.req.header('x-451-client') || ''}`;
  const freioId = podePago ? `k:${chave}` : `ip:${ipc}`;
  const segundos = podePago ? THROTTLE_PRO_SECONDS : THROTTLE_SECONDS;
  if (!admin && !(await throttle(freioId, segundos).catch(() => true))) return anthErr(429, 'rate_limit_error', `Muitas chamadas: espere ${segundos}s.`);

  // Teto global do provedor (só nos pagos; o local é grátis).
  let subjects = null;
  if (!ehLocal) {
    const gb = await checkGlobalBudget().catch(() => ({ ok: true }));
    if (!gb.ok && !(admin && gb.reason === 'monthly_budget')) return anthErr(402, 'api_error', 'Teto do provedor atingido.');
    subjects = await subjectsFor({ plan: 'pro', proKey: chave, visitorIds: [] }).catch(() => null);
    if (!admin && subjects && (await spendStatus(subjects, 'pro').catch(() => ({}))).blocked && modelId === 'claude-sonnet-5-5')
      return anthErr(429, 'rate_limit_error', 'Uso justo do Pro atingido nesta janela.');
  }

  const chat = mensagensDe(messages);
  const tools = ferramentasDe(body.tools);
  const nomePub = ehLocal ? '451-free' : (Object.entries(POR_NOME).find(([, v]) => v === modelId)?.[0] || '451-max');
  const idLinha = `Contexto: você atende pela API do 451 (451sh.com), modelo ${nomePub}. Se perguntarem qual IA você é, responda ${nomePub}; nunca o nome do provedor ou de outro modelo.`;
  const systemPrompt = [sistemaDe(body.system), idLinha].filter(Boolean).join('\n\n');
  const maxTokens = Math.min(Number(body.max_tokens) || 1024, ehLocal ? 1500 : 8192);
  const payload = {
    messages: chat, systemPrompt, modelId,
    api: true, // caminho da API no modelo local: mantém ferramentas, corta por turno, sem cartão de continuar
    claudeFirst: !ehLocal && modelId === 'claude-sonnet-5-5' ? false : (!ehLocal), // Pro: Claude na frente nos que têm
    temperature: body.temperature ?? 0.6, top_p: body.top_p ?? 0.9, max_tokens: maxTokens,
    ...(tools.length ? { tools, ...(body.tool_choice ? { tool_choice: body.tool_choice } : {}) } : {}),
  };

  const inicio = Date.now();
  const usage = {};
  let doneId = modelId;
  const liquida = async (texto) => {
    const cat = MODEL_CATALOG.find((m) => m.id === doneId);
    const custo = ehLocal ? 0 : custoTurno(usage, cat);
    if (custo > 0) await recordCost(custo).catch(() => {});
    if (!admin && !ehLocal && subjects && texto) await addSpend(subjects, 'pro', custo).catch(() => {});
    await registraUso({ sid: subjects?.[0]?.id, tier: podePago ? tier : 'free', admin, nivel: nomeNivel(modelId), usage, custo, ms: Date.now() - inicio, fonte: 'api-anthropic', erro: texto ? null : 'vazia' }).catch(() => {});
  };

  const stream = body.stream === true;
  if (stream) return respostaStream(c, payload, { usage, liquida, setDone: (id) => { doneId = id; }, modelPub: nomePub, maxTokens });
  return respostaUnica(c, payload, { usage, liquida, modelPub: nomePub });
}

// ── streaming no formato Anthropic ──
function respostaStream(c, payload, { usage, liquida, setDone, modelPub, maxTokens }) {
  const id = idMsg();
  const enc = new TextEncoder();
  const corpo = new ReadableStream({
    async start(ctrl) {
      const ac = new AbortController();
      const send = (type, obj) => { try { ctrl.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...obj })}\n\n`)); } catch { /* fechado */ } };
      send('message_start', { message: { id, type: 'message', role: 'assistant', model: modelPub, content: [], stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } } });
      send('ping', {});
      let idx = -1, textoAberto = false, full = '', pararPor = 'end_turn';
      const toolSlots = new Map(); // index interno → { idxAnth }
      const abreTexto = () => { if (!textoAberto) { idx += 1; send('content_block_start', { index: idx, content_block: { type: 'text', text: '' } }); textoAberto = true; } };
      const fechaTexto = () => { if (textoAberto) { send('content_block_stop', { index: idx }); textoAberto = false; } };
      try {
        await (async () => {
          for await (const _ of streamChat('chat', payload, {
            onToken: (t) => { if (!t) return; abreTexto(); full += t; send('content_block_delta', { index: idx, delta: { type: 'text_delta', text: t } }); },
            onReasoning: () => { /* a API Anthropic não transmite o raciocínio do modelo local */ },
            onToolCall: (d) => {
              const i = Number(d.index) || 0;
              if (!toolSlots.has(i)) { fechaTexto(); idx += 1; toolSlots.set(i, idx); send('content_block_start', { index: idx, content_block: { type: 'tool_use', id: d.id || idTool(), name: d.name || 'tool', input: {} } }); pararPor = 'tool_use'; }
              if (d.args) send('content_block_delta', { index: toolSlots.get(i), delta: { type: 'input_json_delta', partial_json: String(d.args) } });
            },
            onWarning: (w) => { if (w && w.to && w.type !== 'fair_use') setDone(w.to); if (w && w.type === 'refusal_forced') full = ''; },
            signal: ac.signal, usage,
          })) { /* consome */ }
        })();
        fechaTexto();
        for (const ia of toolSlots.values()) send('content_block_stop', { index: ia });
        const out = Number(usage.output_tokens) || Math.ceil(full.length / 4);
        send('message_delta', { delta: { stop_reason: pararPor, stop_sequence: null }, usage: { output_tokens: out } });
        send('message_stop', {});
        await liquida(full || (toolSlots.size ? 'tool' : ''));
      } catch (e) {
        send('error', { error: { type: 'api_error', message: e.message } });
      } finally { try { ctrl.close(); } catch { /* */ } }
    },
  });
  return new Response(corpo, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' } });
}

// ── resposta única (não-streaming) no formato Anthropic ──
async function respostaUnica(c, payload, { usage, liquida, modelPub }) {
  let full = ''; const calls = [];
  const ac = new AbortController();
  try {
    for await (const _ of streamChat('chat', payload, {
      onToken: (t) => { if (t) full += t; },
      onToolCall: (d) => { const i = Number(d.index) || 0; const s = calls[i] || (calls[i] = { id: d.id || idTool(), name: d.name || 'tool', args: '' }); if (d.id) s.id = d.id; if (d.name) s.name = d.name; if (d.args) s.args += d.args; },
      onWarning: (w) => { if (w && w.type === 'refusal_forced') { full = ''; calls.length = 0; } },
      signal: ac.signal, usage,
    })) { /* consome */ }
  } catch (e) { return anthErr(502, 'api_error', 'Falha ao gerar a resposta: ' + e.message); }
  const content = [];
  if (full) content.push({ type: 'text', text: full });
  for (const s of calls) if (s) { let input = {}; try { input = JSON.parse(s.args || '{}'); } catch { /* */ } content.push({ type: 'tool_use', id: s.id, name: s.name, input }); }
  await liquida(full || (calls.length ? 'tool' : ''));
  return Response.json({
    id: idMsg(), type: 'message', role: 'assistant', model: modelPub,
    content: content.length ? content : [{ type: 'text', text: '' }],
    stop_reason: calls.length ? 'tool_use' : 'end_turn', stop_sequence: null,
    usage: { input_tokens: Number(usage.input_tokens) || 0, output_tokens: Number(usage.output_tokens) || 0 },
  });
}
