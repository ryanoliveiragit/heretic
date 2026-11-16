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
import { FREE_MODEL, FREE_DAILY_TOKENS, planOf, modelsFor, canUse, estimateTokens, visitorId, getUsed, addUsed, usageStore, planForKey, issueCode } from './plans.js';

export const app = new Hono();

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
app.put('/api/persona', async (c) => {
  const { content } = await c.req.json();
  setPersona(content);
  return c.json({ ok: true });
});

// ── Chat (SSE streaming) ──
// Who is asking: plan, today's token use and the models they can pick.
app.get('/api/me', async (c) => {
  const plan = planOf(c), used = await getUsed(visitorId(c)), limit = plan === 'free' ? FREE_DAILY_TOKENS : null;
  return c.json({ plan, used, limit, remaining: limit === null ? null : Math.max(0, limit - used), store: usageStore(), models: modelsFor(plan) });
});

// Validate an access code (paste "Enter key" flow). Returns the plan it unlocks.
app.post('/api/redeem', async (c) => {
  let code = '';
  try { code = (await c.req.json()).code || ''; } catch {}
  const plan = planForKey(code);
  if (!plan) return c.json({ ok: false, error: 'invalid_code' }, 400);
  return c.json({ ok: true, plan });
});

// Buy/checkout stub: issues a fresh signed Pro code. Swap for Stripe later;
// for now it just returns a code the buyer can copy and paste into "Enter key".
app.post('/api/checkout', async (c) => {
  const code = issueCode();
  return c.json({ ok: true, plan: 'pro', code });
});

app.post('/api/chat', async (c) => {
  const body = await c.req.json();
  const mode = body.mode || 'chat';
  const convId = body.conversationId;
  const plan = planOf(c), who = visitorId(c);
  const modelId = body.model || FREE_MODEL;
  if (!canUse(plan, modelId)) return c.json({ error: 'pro_model', message: 'This model is part of Pro.' }, 403);
  const limit = plan === 'free' ? FREE_DAILY_TOKENS : null;
  const usedBefore = await getUsed(who);
  if (limit !== null && usedBefore >= limit) return c.json({ error: 'daily_token_limit', used: usedBefore, limit }, 429);

  const budget = checkBudget();
  if (budget.blocked) return c.json({ error: 'Daily limit reached' }, 429);

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
    max_tokens: body.params?.max_tokens ?? 4096,
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
      try {
        const chatPayload = { messages: body.messages || [], systemPrompt, modelId, ...params };
        const handlers = {
          onToken: (t) => { fullText += t; send('token', { token: t }); },
          onWarning: (w) => send('warning', w),
          signal: ac.signal,
        };
        // Modo Qualidade (best-of-2) só no Pro; caso contrário, stream normal de 1 modelo.
        if (body.quality && plan === 'pro') {
          await qualityAnswer(mode, chatPayload, handlers);
        } else {
          for await (const _ of streamChat(mode, chatPayload, handlers)) { /* tokens via onToken */ }
        }

        if (convId && fullText) addMessage(convId, 'assistant', fullText);
        incrementUsage();
        const spent = estimateTokens((body.messages || []).map(m => m.content).join('\n')) + estimateTokens(fullText);
        const used = await addUsed(who, spent);
        send('usage', { used, limit, remaining: limit === null ? null : Math.max(0, limit - used), spent });
        send('done', { content: fullText });
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Aborted by user' : e.message;
        send('error', { message: msg });
      } finally {
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
