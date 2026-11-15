// Hono app — API routes only (no static files, no Node.js APIs).
// Shared between Vercel Edge (api/[[...route]].js) and local dev (src/server.js).

import { Hono } from 'hono';
import { health, listProjects, createProject, deleteProject,
  listConversations, createConversation, deleteConversation,
  listMessages, addMessage } from './store.js';
import { getPersona, setPersona } from './persona.js';
import { streamChat, getRoutes, setRoute, MODEL_CATALOG } from './upstream.js';
import { checkBudget, incrementUsage } from './budget.js';

export const app = new Hono();

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
app.post('/api/chat', async (c) => {
  const body = await c.req.json();
  const mode = body.mode || 'chat';
  const convId = body.conversationId;

  const budget = checkBudget();
  if (budget.blocked) return c.json({ error: 'Daily limit reached' }, 429);

  const userMsg = body.messages?.filter(m => m.role === 'user').pop();
  if (convId && userMsg) addMessage(convId, 'user', userMsg.content);

  const systemPrompt = getPersona();
  const params = {
    temperature: body.params?.temperature ?? 1,
    top_p: body.params?.top_p ?? 1,
    max_tokens: body.params?.max_tokens ?? 4096,
  };

  const ac = new AbortController();
  let fullText = '';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event, data) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const token of streamChat(mode, {
          messages: body.messages || [],
          systemPrompt,
          ...params,
        }, {
          onToken: (t) => {
            fullText += t;
            send('token', { token: t });
          },
          onWarning: (w) => send('warning', w),
          signal: ac.signal,
        })) { /* tokens sent via onToken */ }

        if (convId && fullText) addMessage(convId, 'assistant', fullText);
        incrementUsage();
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
