// Hono app — API routes only (no static files, no Node.js APIs).
// Shared between Vercel Edge (api/[[...route]].js) and local dev (src/server.js).

import { Hono } from 'hono';
import { health, listProjects, createProject, deleteProject,
  listConversations, createConversation, deleteConversation,
  listMessages, addMessage } from './store.js';
import { getPersona, setPersona } from './persona.js';
import { streamChat, qualityAnswer, getRoutes, setRoute, MODEL_CATALOG } from './upstream.js';
import { checkBudget, incrementUsage } from './budget.js';
import { AGENTS, agentPrompt } from './agents.js';
import { planOf, modelsFor, resolveModel, visitorIds, keyFrom, planForKeyAsync, paidKeyExpiry } from './plans.js';
import { PERIODS, availableMethods, createPayment, paymentStatus, handleNowPaymentsIpn, handleAbacateWebhook, confirmMock, loadOrder } from './payments.js';
import { LIMITS, RESOURCES, bucketOf, subjectsFor, peekQuota, consumeQuota, refundQuota, limitsStore } from './limits.js';
import { readAttachments, newUploads } from './attachments.js';

export const app = new Hono();

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
  const adminKey = process.env.HERETIC_ADMIN_KEY;
  if (adminKey) {
    if ((c.req.header('x-heretic-admin') || '') !== adminKey) {
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
  const plan = await planOf(c), subjects = await subjectsOf(c, plan);
  const models = modelsFor(plan).map(m => ({ ...m, bucket: bucketOf(m.id) }));
  const buckets = [...new Set(models.filter(m => !m.locked).map(m => m.bucket))];
  const rows = await Promise.all(RESOURCES.flatMap(resource => buckets.map(bucket => peekQuota(subjects, resource, bucket))));
  // Chave paga: até quando o Pro vale (o app mostra e oferece renovar).
  const proUntil = plan === 'pro' ? await paidKeyExpiry(keyFrom(c)) : null;
  return c.json({ plan, proUntil, store: limitsStore(), models, quotas: rows, limits: LIMITS });
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
  const plan = await planOf(c), subjects = await subjectsOf(c, plan);
  let body = {};
  try { body = await c.req.json(); } catch {}
  const prompt = (body.prompt || '').toString().trim().slice(0, 1500);
  if (!prompt) return c.json({ error: 'empty_prompt' }, 400);
  const charges = [{ resource: 'image_gen', bucket: plan === 'pro' ? 'titan' : 'free' }];
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
app.post('/api/redeem', async (c) => {
  let code = '';
  try { code = (await c.req.json()).code || ''; } catch {}
  const plan = await planForKeyAsync(code);
  if (!plan) return c.json({ ok: false, error: 'invalid_code' }, 400);
  return c.json({ ok: true, plan });
});

// Buy/checkout stub: issues a fresh signed Pro code. Swap for Stripe later;
// for now it just returns a code the buyer can copy and paste into "Enter key".
// ── Pagamento do Pro: Pix (AbacatePay) ou cripto (NOWPayments) ── ver src/payments.js
const publicOrigin = (c) => (process.env.PUBLIC_URL || new URL(c.req.url).origin).replace(/\/$/, '');
app.get('/api/pay', (c) => c.json({ methods: availableMethods(), periods: PERIODS }));
app.post('/api/pay', async (c) => {
  let body = {};
  try { body = await c.req.json(); } catch {}
  try {
    return c.json(await createPayment({ method: body.method, period: body.period, currentKey: keyFrom(c), origin: publicOrigin(c) }));
  } catch (e) {
    if (e.detail) console.error('[pagamento]', e.message, e.detail);
    return c.json({ error: 'pay_failed', message: e.message }, e.status || 500);
  }
});
app.post('/api/pay/nowpayments', async (c) => {
  const r = await handleNowPaymentsIpn(await c.req.text(), c.req.header('x-nowpayments-sig'));
  return c.json({ ok: r.ok }, r.status);
});
app.post('/api/pay/abacatepay', async (c) => {
  const r = await handleAbacateWebhook(await c.req.text(), c.req.header('x-webhook-secret') || c.req.query('webhookSecret'));
  return c.json({ ok: r.ok }, r.status);
});
// Página do processador de mentira, só no modo simulado (PAY_MODE=mock).
app.get('/api/pay/simulado/:id', async (c) => {
  if (process.env.PAY_MODE !== 'mock') return c.notFound();
  const order = await loadOrder(c.req.param('id'));
  if (!order) return c.notFound();
  const valor = (order.cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pagamento simulado</title><body style="background:#040405;color:#e8e2d0;font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0"><form method="post" style="text-align:center"><p>Pagamento SIMULADO (${order.method === 'pix' ? 'Pix' : 'cripto'})</p><p style="font-size:32px;margin:8px 0 24px">${valor}</p><button style="font:inherit;padding:10px 20px">Confirmar pagamento de teste</button></form></body>`);
});
app.post('/api/pay/simulado/:id', async (c) => {
  const order = await confirmMock(c.req.param('id'));
  if (!order) return c.notFound();
  return c.redirect(`/app/?pedido=${order.id}`, 303);
});
app.get('/api/pay/:id', async (c) => {
  const st = await paymentStatus(c.req.param('id'));
  return st ? c.json(st) : c.json({ error: 'not_found' }, 404);
});

app.post('/api/checkout', async (c) => {
  // Desativado: Pro é exclusivo do dono, sem geração pública de chave.
  return c.json({ ok: false, error: 'disabled', message: 'Pro não está aberto.' }, 403);
});

app.post('/api/chat', async (c) => {
  const body = await c.req.json();
  const mode = body.mode || 'chat';
  const convId = body.conversationId;
  const plan = await planOf(c);
  const modelId = resolveModel(plan, body.model);
  if (!modelId) return c.json({ error: 'pro_model', message: 'Este modelo faz parte do Pro.' }, 403);
  const bucket = bucketOf(modelId);

  const parsed = readAttachments(body.messages);
  if (parsed.error) return c.json({ error: parsed.error, message: ATTACHMENT_ERRORS[parsed.error] }, 400);
  if (parsed.count && bucket === 'free') return c.json({ error: 'pro_attachment', message: 'Imagem e PDF fazem parte dos modelos Pro.' }, 403);
  const chatMessages = plan === 'pro' ? parsed.messages : capHistory(parsed.messages);

  const budget = checkBudget();
  if (budget.blocked) return c.json({ error: 'Daily limit reached' }, 429);

  // Mensagem, imagens enviadas e arquivos têm limites separados; só o que é novo nesta mensagem gasta.
  const uploads = newUploads(chatMessages);
  const subjects = await subjectsOf(c, plan);
  // Modo Qualidade (arena) gera 2 respostas: conta como 2 mensagens no limite.
  const arena = !!(body.quality && plan === 'pro' && !parsed.count);
  const charges = [
    { resource: 'messages', bucket, amount: arena ? 2 : 1 },
    { resource: 'image_upload', bucket, amount: uploads.images },
    { resource: 'files', bucket, amount: uploads.files },
  ];
  const reserved = await consumeQuota(subjects, charges);
  if (!reserved.ok) return c.json({ error: 'limit_reached', quota: reserved.quota, requested: reserved.requested }, 429);

  const userMsg = body.messages?.filter(m => m.role === 'user').pop();
  if (convId && userMsg) addMessage(convId, 'user', userMsg.content);

  const agent = agentPrompt(body.agent);
  const systemPrompt = agent ? `${getPersona()}\n\n${agent}` : getPersona();
  // Sampling calmo por padrão: temperatura 1.0 + top_p 1.0 fazia os modelos menores
  // (ex.: Venice UC grátis) degenerarem em texto sem sentido e misturar idioma. 0.6/0.9 +
  // frequency_penalty mantém a resposta coerente e direta.
  const params = {
    temperature: body.params?.temperature ?? 0.6,
    top_p: body.params?.top_p ?? 0.9,
    max_tokens: Math.min(Number(body.params?.max_tokens) || 4096, plan === 'pro' ? 8192 : 4096),
    frequency_penalty: body.params?.frequency_penalty ?? 0.4,
    presence_penalty: body.params?.presence_penalty ?? 0.1,
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
      // Batimento: o Max só entrega o texto quando termina, o que pode levar minutos. Sem nenhum byte
      // nesse intervalo o Safari derruba a conexão e mostra "Load failed". O app ignora comentários SSE.
      const batimento = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { clearInterval(batimento); }
      }, 15000);
      try {
        const chatPayload = { messages: chatMessages, systemPrompt, modelId, ...params };
        const handlers = {
          onToken: (t) => { fullText += t; send('token', { token: t }); },
          // FORÇA TUDO: o guarda descartou uma recusa parcial → o texto final começa limpo.
          onWarning: (w) => { if (w && w.type === 'refusal_forced') fullText = ''; send('warning', w); },
          signal: ac.signal,
        };
        // Modo Qualidade (best-of-2) só no Pro; caso contrário, stream normal de 1 modelo.
        if (arena) {
          await qualityAnswer(mode, chatPayload, handlers);
        } else {
          for await (const _ of streamChat(mode, chatPayload, handlers)) { /* tokens via onToken */ }
        }

        if (convId && fullText) addMessage(convId, 'assistant', fullText);
        incrementUsage();
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
