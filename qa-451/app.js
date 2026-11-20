// Hono app — API routes only (no static files, no Node.js APIs).
// Shared between Vercel Edge (api/[[...route]].js) and local dev (src/server.js).

import { Hono } from 'hono';
import { health, listProjects, createProject, deleteProject,
  listConversations, createConversation, deleteConversation,
  listMessages, addMessage } from './store.js';
import { getPersona, setPersona } from './persona.js';
import { streamChat, qualityAnswer, enhancePrompt, agentTip, getRoutes, setRoute, MODEL_CATALOG } from './upstream.js';
import { checkBudget, incrementUsage } from './budget.js';
import { checkGlobalBudget, recordCost } from './cost.js';
import { AGENTS, agentPrompt } from './agents.js';
import { planOf, tierOf, modelsFor, resolveModel, visitorIds, keyFrom, planForKey, FAIR_USE_MODEL, PUBLIC_MODELS } from './plans.js';
import { creditBalance, spendCredits, addExtraCredits, priceCredits, throttle, MIN_TO_START, THROTTLE_SECONDS } from './credits.js';
import { LIMITS, RESOURCES, HIDDEN_BUCKETS, bucketOf, subjectsFor, peekQuota, consumeQuota, refundQuota, limitsStore } from './limits.js';
import { readAttachments, newUploads } from './attachments.js';
import { v1 } from './v1.js';
import { pay, payWebhook } from './pay.js';

export const app = new Hono();

// Pagamento do Pro (Pix via Woovi, cripto via NOWPayments).
// GET/POST /api/pay via catch-all; GET /api/pay/:id via api/pay/[orderId].js; webhook em /api/payment.
app.route('/api/pay', pay);
app.post('/api/payment', payWebhook);

// API compatível com OpenAI — chave 451 do Pro/Pro Plus em clientes como o opencode.
// A Vercel só entrega caminhos /api de UM segmento à função; por isso o rewrite em vercel.json
// manda /v1/* para a entrada /api (que a função pega) preservando o caminho original /v1/...
// Montamos nos dois prefixos para casar o caminho que o Hono enxergar.
app.route('/v1', v1);
app.route('/api/v1', v1);

// Teto de saída por modelo (dono, 19/11): Max e os modelos de créditos respondem mais longo.
const LONG_MODELS = ['claude-sonnet-5-5', 'hermes-4-405b', 'kimi-k3.1-pro-uncensored'];
const maxTokensFor = (modelId) => (LONG_MODELS.includes(modelId) ? 2000 : 900);
const TIER_LABEL = { free: 'Grátis', pro: 'Pro', plus: 'Pro Plus' };
// Limites que o app recebe: sem os buckets pagos, que para o assinante são "ilimitados".
const visibleLimits = () => Object.fromEntries(Object.entries(LIMITS).map(([r, b]) =>
  [r, Object.fromEntries(Object.entries(b).filter(([k]) => !HIDDEN_BUCKETS.includes(k)))]));

// Quem está sendo contado nos limites deste pedido.
const subjectsOf = (c, plan) => subjectsFor({ plan, proKey: keyFrom(c), visitorIds: visitorIds(c) });
// Corta o histórico antigo do grátis: o limite de mensagens não segura o tamanho de cada mensagem.
const FREE_MAX_INPUT_CHARS = 48000;
function capHistory(messages) {
  let room = FREE_MAX_INPUT_CHARS;
  const kept = [];
  for (const m of [...messages].reverse()) {
    const text = typeof m?.content === 'string' ? m.content : '';
    if (room <= 0) break;
    kept.unshift(text.length > room ? { ...m, content: text.slice(0, room) } : m);
    room -= text.length;
  }
  return kept;
}
const ATTACHMENT_ERRORS = {
  attachment_type: 'Tipo de arquivo não aceito. Envie JPG, PNG, WEBP, GIF ou PDF.',
  attachment_invalid: 'Não consegui abrir este arquivo.',
  attachment_count: 'Envie no máximo 5 anexos por mensagem.',
  attachment_size: 'Os anexos passam do tamanho máximo desta mensagem.',
  attachment_pages: 'O PDF passa de 30 páginas.',
};

// ── Agents ──
app.get('/api/agents', (c) => c.json(Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name }))));

// ── Health ──
app.get('/api/health', (c) => c.json(health()));

// ── Models ──
app.get('/api/models', (c) => c.json(MODEL_CATALOG));

// ── Routes ──
app.get('/api/routes', (c) => c.json(getRoutes()));
app.put('/api/routes', async (c) => {
  const { mode, model } = await c.req.json();
  if (!mode || !model) return c.json({ error: 'mode e model obrigatórios' }, 400);
  try { return c.json(setRoute(mode, model)); }
  catch (e) { return c.json({ error: e.message }, 400); }
});

// ── Projects ──
app.get('/api/projects', (c) => c.json(listProjects()));
app.post('/api/projects', async (c) => {
  const { name, target_url } = await c.req.json();
  return c.json(createProject(name, target_url || null), 201);
});
app.delete('/api/projects/:id', (c) => {
  deleteProject(parseInt(c.req.param('id')));
  return c.json({ ok: true });
});

// ── Conversations ──
app.get('/api/conversations', (c) => {
  const projectId = c.req.query('projectId');
  return c.json(listConversations(projectId ? parseInt(projectId) : null));
});
app.post('/api/conversations', async (c) => {
  const { project_id, title } = await c.req.json();
  return c.json(createConversation(project_id || null, title), 201);
});
app.delete('/api/conversations/:id', (c) => {
  deleteConversation(parseInt(c.req.param('id')));
  return c.json({ ok: true });
});
app.get('/api/conversations/:id/messages', (c) =>
  c.json(listMessages(parseInt(c.req.param('id')))));

// ── Approvals ──
app.post('/api/approve', async (c) => {
  const body = await c.req.json();
  return c.json({ ok: true, decision: body.decision });
});

// ── Persona ──
app.get('/api/persona', (c) => c.json({ content: getPersona() }));
// PUT com trancas (dono 18/11): o site é aberto e qualquer visitor conseguia trocar a persona
// de todos. Com HERETIC_ADMIN_KEY configurada → exige o header x-heretic-admin. Sem a chave,
// em produção o PUT fica fechado (fail-closed); em dev segue aberto.
app.put('/api/persona', async (c) => {
  const adminKey = process.env.ADMIN_KEY || process.env.HERETIC_ADMIN_KEY;
  if (adminKey) {
    if ((c.req.header('x-451-admin') || c.req.header('x-heretic-admin') || '') !== adminKey) {
      return c.json({ error: 'unauthorized', message: 'Chave de admin inválida (header x-heretic-admin).' }, 401);
    }
  } else if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'locked', message: 'PUT /api/persona desativado: HERETIC_ADMIN_KEY não configurada.' }, 403);
  }
  const { content } = await c.req.json();
  setPersona(content);
  return c.json({ ok: true });
});

// ── Chat (SSE streaming) ──
// Who is asking: plan, today's token use and the models they can pick.
app.get('/api/me', async (c) => {
  const plan = planOf(c), tier = tierOf(c), subjects = await subjectsOf(c, plan);
  const models = modelsFor(plan).map(m => ({ ...m, bucket: bucketOf(m.id, tier) }));
  const buckets = [...new Set(models.filter(m => !m.locked).map(m => m.bucket))].filter(b => !HIDDEN_BUCKETS.includes(b));
  const rows = await Promise.all(RESOURCES.flatMap(resource => buckets.map(bucket => peekQuota(subjects, resource, bucket))));
  const credits = tier === 'free' ? null : await creditBalance(subjects[0].id, tier).catch(() => null);
  return c.json({ plan, tier, tierLabel: TIER_LABEL[tier], store: limitsStore(), models, quotas: rows, limits: visibleLimits(), credits });
});

// Geração de imagem. "Ferramenta" do chat: /imagem <prompt>. Sem censura.
// Provedor "nosso" = Pollinations (Flux, 100% grátis, sem chave, independente da Venice).
// Venice fica só como reserva se o Pollinations falhar. Desconta um custo pequeno do orçamento diário.
// Codifica bytes -> base64 no runtime Edge (sem Buffer), em blocos pra não estourar a pilha.
function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
app.post('/api/image', async (c) => {
  const plan = planOf(c), subjects = await subjectsOf(c, plan);
  let body = {};
  try { body = await c.req.json(); } catch {}
  const prompt = (body.prompt || '').toString().trim().slice(0, 1500);
  if (!prompt) return c.json({ error: 'empty_prompt' }, 400);
  const charges = [{ resource: 'image_gen', bucket: plan === 'pro' ? 'pro' : 'free' }];
  const reserved = await consumeQuota(subjects, charges);
  if (!reserved.ok) return c.json({ error: 'limit_reached', quota: reserved.quota }, 429);
  const done = (dataUrl, provider) => c.json({ image: dataUrl, provider, quotas: reserved.quotas });
  // 1) fal.ai (Flux) — PRIMÁRIO quando FAL_KEY estiver setada: Flux preciso, sem censura
  //    (enable_safety_checker:false, exige conta autorizada), fora da Venice. Modelo via FAL_MODEL
  //    (fal-ai/flux/schnell barato; fal-ai/flux/dev mais preciso). sync_mode devolve data URI direto.
  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (falKey) {
    try {
      const model = process.env.FAL_MODEL || 'fal-ai/flux/schnell';
      const r = await fetch(`https://fal.run/${model}`, {
        method: 'POST',
        headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image_size: 'square_hd', num_images: 1, enable_safety_checker: false, sync_mode: true, output_format: 'jpeg' }),
      });
      if (r.ok) {
        const data = await r.json();
        const u = data && data.images && data.images[0] && data.images[0].url;
        if (u && u.startsWith('data:')) return done(u, 'fal');
        if (u) {
          const ir = await fetch(u);
          if (ir.ok) {
            const bytes = new Uint8Array(await ir.arrayBuffer());
            const ct = ir.headers.get('content-type') || 'image/jpeg';
            return done(`data:${ct};base64,${bytesToBase64(bytes)}`, 'fal');
          }
        }
      }
    } catch { /* cai pra Venice */ }
  }
  // 2) Venice sd35 — sem censura (safe_mode:false), preciso, usa a chave Venice que já temos.
  //    Fica como primário enquanto não houver FAL_KEY; depois vira reserva do fal.ai.
  const key = process.env.IMAGE_VENICE_KEY || process.env.VENICE_API_KEY;
  if (key) {
    try {
      const r = await fetch('https://api.venice.ai/api/v1/image/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'venice-sd35', prompt, width: 1024, height: 1024, steps: 28, safe_mode: false, format: 'webp', hide_watermark: true }),
      });
      if (r.ok) {
        const data = await r.json();
        const b64 = data && data.images && data.images[0];
        if (b64) return done(`data:image/webp;base64,${b64}`, 'venice');
      }
    } catch { /* cai pra reserva */ }
  }
  // 3) Reserva final: Pollinations (grátis, menos preciso) — nunca deixa o usuário sem imagem.
  try {
    const seed = Math.floor(Math.random() * 1e6);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
    const r = await fetch(url, { headers: { Accept: 'image/*' } });
    if (r.ok) {
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length > 1000) {
        const ct = r.headers.get('content-type') || 'image/jpeg';
        return done(`data:${ct};base64,${bytesToBase64(bytes)}`, 'pollinations');
      }
    }
  } catch { /* falhou também */ }
  await refundQuota(subjects, charges);
  return c.json({ error: 'image_failed' }, 502);
});

// Validate an access code (paste "Enter key" flow). Returns the plan it unlocks.
// Co-work do agente (Pro/Plus): uma dica de próximo passo a partir do último pedido e resposta.
app.post('/api/agent/tip', async (c) => {
  const tier = tierOf(c);
  if (tier !== 'pro' && tier !== 'plus') return c.json({ error: 'pro_only' }, 403);
  let body = {};
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
  const plan = planOf(c), subjects = await subjectsOf(c, plan);
  if (!(await throttle(`${subjects[0].id}:tip`))) return c.json({ error: 'rate_limit' }, 429);
  const tip = await agentTip(body.question, body.answer).catch(() => null);
  return c.json({ tip });
});

app.post('/api/redeem', async (c) => {
  let code = '';
  try { code = (await c.req.json()).code || ''; } catch {}
  const plan = planForKey(code);
  if (!plan) return c.json({ ok: false, error: 'invalid_code' }, 400);
  return c.json({ ok: true, plan: 'pro', tier: plan, tierLabel: TIER_LABEL[plan] });
});

// Recarga de créditos avulsos (hoje manual; o webhook de pagamento usa o mesmo caminho depois).
// Exige HERETIC_ADMIN_KEY no header x-heretic-admin. body: { code, amount }.
app.post('/api/admin/credits', async (c) => {
  const adminKey = process.env.ADMIN_KEY || process.env.HERETIC_ADMIN_KEY;
  if (!adminKey || (c.req.header('x-451-admin') || c.req.header('x-heretic-admin') || '') !== adminKey) return c.json({ error: 'unauthorized' }, 401);
  let body = {};
  try { body = await c.req.json(); } catch {}
  const tier = planForKey(body.code);
  if (!tier) return c.json({ error: 'invalid_code' }, 400);
  const [subject] = await subjectsFor({ plan: 'pro', proKey: body.code, visitorIds: [] });
  const extra = await addExtraCredits(subject.id, body.amount);
  return c.json({ ok: true, tier, extra, balance: await creditBalance(subject.id, tier) });
});

// Buy/checkout stub: issues a fresh signed Pro code. Swap for Stripe later;
// for now it just returns a code the buyer can copy and paste into "Enter key".
app.post('/api/checkout', async (c) => {
  // Desativado: Pro é exclusivo do dono, sem geração pública de chave.
  return c.json({ ok: false, error: 'disabled', message: 'Pro não está aberto.' }, 403);
});

app.post('/api/chat', async (c) => {
  const body = await c.req.json();
  const mode = body.mode || 'chat';
  const convId = body.conversationId;
  const plan = planOf(c), tier = tierOf(c);
  let modelId = resolveModel(plan, body.model);
  if (!modelId) return c.json({ error: 'pro_model', message: 'Este modelo faz parte do Pro.' }, 403);
  let bucket = bucketOf(modelId, tier);

  const parsed = readAttachments(body.messages);
  if (parsed.error) return c.json({ error: parsed.error, message: ATTACHMENT_ERRORS[parsed.error] }, 400);
  if (parsed.count && bucket === 'free') return c.json({ error: 'pro_attachment', message: 'Imagem e PDF fazem parte dos modelos Pro.' }, 403);
  const chatMessages = plan === 'pro' ? parsed.messages : capHistory(parsed.messages);

  const budget = checkBudget();
  if (budget.blocked) return c.json({ error: 'Daily limit reached' }, 429);
  // Teto global em dólar (OpenUncensored): mês estourado ou saldo da chave acabando.
  const globalBudget = await checkGlobalBudget();
  if (!globalBudget.ok && bucket !== 'free') {
    return c.json({ error: 'budget', message: globalBudget.reason === 'monthly_budget' ? 'Teto mensal do provedor atingido.' : 'Saldo do provedor acabou.', budget: globalBudget }, 402);
  }

  // Mensagem, imagens enviadas e arquivos têm limites separados; só o que é novo nesta mensagem gasta.
  const uploads = newUploads(chatMessages);
  const subjects = await subjectsOf(c, plan);
  // Freio de velocidade (uso justo): uma mensagem a cada poucos segundos por pessoa.
  // No grátis o freio vale por aparelho, não por IP (IP de operadora é compartilhado).
  const throttleId = (subjects.find(x => x.id.startsWith('fp:')) || subjects[0]).id;
  if (!(await throttle(throttleId))) {
    return c.json({ error: 'slow_down', message: `Calma: espere ${THROTTLE_SECONDS} segundos entre uma mensagem e outra.` }, 429);
  }
  // Modelos de ponta só com créditos.
  if (bucket === 'credits') {
    const bal = await creditBalance(subjects[0].id, tier);
    if (bal.total < MIN_TO_START) return c.json({ error: 'no_credits', message: 'Seus créditos acabaram. Os modelos 451 Rapid, Titan e Max seguem ilimitados; para Hermes e Kimi, recarregue créditos ou espere a cota do próximo mês.', credits: bal }, 402);
  }
  const chargesFor = (b) => [
    { resource: 'messages', bucket: b },
    { resource: 'image_upload', bucket: b, amount: uploads.images },
    { resource: 'files', bucket: b, amount: uploads.files },
  ];
  let charges = chargesFor(bucket);
  let reserved = await consumeQuota(subjects, charges);
  // Uso justo do "ilimitado": passou do teto do dia nos modelos 451 → a conversa segue no Rapid.
  let fairUse = false;
  if (!reserved.ok && bucket === 'pro' && reserved.quota?.resource === 'messages') {
    modelId = FAIR_USE_MODEL; bucket = 'pro_rapid'; fairUse = true;
    charges = chargesFor(bucket);
    reserved = await consumeQuota(subjects, charges);
  }
  if (!reserved.ok) return c.json({ error: 'limit_reached', quota: reserved.quota, requested: reserved.requested }, 429);

  const userMsg = body.messages?.filter(m => m.role === 'user').pop();
  if (convId && userMsg) addMessage(convId, 'user', userMsg.content);

  const agent = agentPrompt(body.agent);
  const planLine = `Plano ${TIER_LABEL[tier]}. Respostas diretas, sem repetir contexto.`;
  const modelNome = PUBLIC_MODELS.find(p => p.id === modelId)?.name || '451';
  const idLine = `Identidade: você é o ${modelNome} (451sh.com). Se perguntarem qual modelo ou IA você é, responda "${modelNome}" — nunca o nome do provedor, da infraestrutura ou de outro modelo.`;
  const systemPrompt = agent ? `${planLine}\n\n${getPersona()}\n\n${agent}\n\n${idLine}` : `${planLine}\n\n${getPersona()}\n\n${idLine}`;
  // Sampling calmo por padrão: temperatura 1.0 + top_p 1.0 fazia os modelos menores
  // (ex.: Venice UC grátis) degenerarem em texto sem sentido e misturar idioma. 0.6/0.9 +
  // frequency_penalty mantém a resposta coerente e direta.
  // Raciocínio (baixo/médio/alto): o usuário escolhe o quanto o Max pensa; vira thinking budget no upstream.
  const effortNorm = { baixo: 'baixo', low: 'baixo', medio: 'medio', medium: 'medio', alto: 'alto', high: 'alto' }[String(body.effort || '').toLowerCase()] || null;
  const params = {
    temperature: body.params?.temperature ?? 0.6,
    top_p: body.params?.top_p ?? 0.9,
    // Teto de saída por plano (mapa do dono, 19/11): Free 600, Titan 900, Max 2000.
    max_tokens: Math.min(Number(body.params?.max_tokens) || maxTokensFor(modelId), maxTokensFor(modelId)),
    frequency_penalty: body.params?.frequency_penalty ?? 0.4,
    presence_penalty: body.params?.presence_penalty ?? 0.1,
    ...(effortNorm ? { effort: effortNorm } : {}),
  };

  const ac = new AbortController();
  let fullText = '';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event, data) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      // Flush imediato: fecha a conexão SSE com o cliente na hora. Sem isto, se o upstream demora
      // (ex.: Pollinations lento), o navegador desiste antes do 1º token e mostra "Load failed".
      controller.enqueue(encoder.encode(`: connected\n\n`));
      if (fairUse) send('warning', { type: 'fair_use', message: 'Uso justo: hoje você passou de 200 mensagens nos modelos 451; esta resposta vem do 451 Rapid, sem limite.' });
      // Batimento: o Max só entrega o texto quando termina, o que pode levar minutos. Sem nenhum byte
      // nesse intervalo o Safari derruba a conexão e mostra "Load failed". O app ignora comentários SSE.
      const batimento = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { clearInterval(batimento); }
      }, 15000);
      try {
        const usage = {};
        // Afinador: antes de responder, um modelo rápido reescreve o pedido do usuário (só Pro/Plus,
        // quando ligado). Emite 'enhanced' para o app animar o texto trocando. Falhou → segue igual.
        let sendMessages = chatMessages;
        if (body.enhance && (tier === 'pro' || tier === 'plus') && userMsg && typeof userMsg.content === 'string') {
          send('warning', { type: 'enhancing', message: 'Afinando o pedido…' });
          const better = await enhancePrompt(mode, userMsg.content, ac.signal, usage, body.agentPrefs || null).catch(() => '');
          if (better && better !== userMsg.content.trim()) {
            const lui = chatMessages.map(m => m.role).lastIndexOf('user');
            if (lui >= 0) sendMessages = chatMessages.map((m, i) => (i === lui ? { ...m, content: better } : m));
            send('enhanced', { original: userMsg.content, text: better });
          }
        }
        const chatPayload = { messages: sendMessages, systemPrompt, modelId, ...params };
        const handlers = {
          onToken: (t) => { fullText += t; send('token', { token: t }); },
          // FORÇA TUDO: o guarda descartou uma recusa parcial → o texto final começa limpo.
          onWarning: (w) => { if (w && w.type === 'refusal_forced') fullText = ''; send('warning', w); },
          signal: ac.signal,
          usage,
        };
        // Modo Qualidade (best-of-2) só no Pro; caso contrário, stream normal de 1 modelo.
        if (body.quality && plan === 'pro' && !parsed.count) {
          await qualityAnswer(mode, chatPayload, handlers);
        } else {
          for await (const _ of streamChat(mode, chatPayload, handlers)) { /* tokens via onToken */ }
        }

        if (convId && fullText) addMessage(convId, 'assistant', fullText);
        incrementUsage();
        // Custo real do turno: o provedor devolve ou.cost_usd; sem ele, estima por tokens × preço.
        const cat = MODEL_CATALOG.find(m => m.id === modelId);
        const cost = usage.cost_usd != null
          ? Number(usage.cost_usd)
          : ((Number(usage.input_tokens) || 0) * (cat?.price_in || 0) + (Number(usage.output_tokens) || 0) * (cat?.price_out || 0)) / 1e6;
        if (cost > 0) await recordCost(cost).catch(() => {});
        // Hermes/Kimi: desconta créditos pelo custo real (resposta vazia não cobra).
        if (bucket === 'credits' && fullText) {
          const bal = await spendCredits(subjects[0].id, tier, priceCredits(cost)).catch(() => null);
          if (bal) send('credits', { spent: priceCredits(cost), balance: bal });
        }
        // Resposta vazia não gasta o limite de quem perguntou.
        const quotas = fullText ? reserved.quotas : await refundQuota(subjects, charges);
        send('usage', { quotas });
        send('done', { content: fullText });
      } catch (e) {
        if (!fullText) await refundQuota(subjects, charges).catch(() => {});
        const msg = e.name === 'AbortError' ? 'Aborted by user' : e.message;
        try { send('error', { message: msg }); } catch { /* cliente já saiu */ }
      } finally {
        clearInterval(batimento);
        controller.close();
      }
    },
    cancel() { ac.abort(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
