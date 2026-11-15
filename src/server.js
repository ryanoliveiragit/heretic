import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

import { initDb, health, listProjects, createProject, deleteProject,
  listConversations, createConversation, deleteConversation, getConversation,
  listMessages, addMessage } from './db.js';
import { getPersona } from './persona.js';
import { streamChat, getRoutes, setRoute, MODEL_CATALOG } from './upstream.js';
import { checkBudget, incrementUsage } from './budget.js';
import { logUsage } from './cost.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

initDb();

// Carregar .env manualmente (sem dotenv)
try {
  const envFile = await readFile(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const app = new Hono();

// Servir arquivos estáticos do public/
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
};

async function serveStatic(c, relPath) {
  const filePath = join(PUBLIC_DIR, relPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return c.text('Forbidden', 403);
  if (!existsSync(filePath)) return c.text('Not found', 404);
  const data = await readFile(filePath);
  const mime = MIME[extname(filePath)] || 'application/octet-stream';
  return new Response(data, { headers: { 'Content-Type': mime } });
}

app.get('/', async (c) => serveStatic(c, 'index.html'));
// Assets do build Vite (JS, CSS, fontes) com nome hasheado
app.get('/assets/:file', async (c) => serveStatic(c, join('assets', c.req.param('file'))));
app.get('/favicon.svg', async (c) => serveStatic(c, 'favicon.svg'));
app.get('/favicon.ico', async (c) => serveStatic(c, 'favicon.ico'));

// Health
app.get('/api/health', (c) => c.json(health()));

// Models catalog
app.get('/api/models', (c) => c.json(MODEL_CATALOG));

// Routes (current model per mode)
app.get('/api/routes', (c) => c.json(getRoutes()));
app.put('/api/routes', async (c) => {
  const body = await c.req.json();
  const { mode, model } = body;
  if (!mode || !model) return c.json({ error: 'mode e model obrigatórios' }, 400);
  try {
    const updated = await setRoute(mode, model);
    return c.json(updated);
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

// Projects
app.get('/api/projects', (c) => c.json(listProjects()));
app.post('/api/projects', async (c) => {
  const body = await c.req.json();
  const p = createProject(body.name, body.target_url || null);
  return c.json(p, 201);
});
app.delete('/api/projects/:id', (c) => {
  deleteProject(parseInt(c.req.param('id')));
  return c.json({ ok: true });
});

// Conversations
app.get('/api/conversations', (c) => {
  const projectId = c.req.query('projectId');
  return c.json(listConversations(projectId ? parseInt(projectId) : null));
});
app.post('/api/conversations', async (c) => {
  const body = await c.req.json();
  const conv = createConversation(body.project_id || null, body.title);
  return c.json(conv, 201);
});
app.delete('/api/conversations/:id', (c) => {
  deleteConversation(parseInt(c.req.param('id')));
  return c.json({ ok: true });
});
app.get('/api/conversations/:id/messages', (c) => {
  const id = parseInt(c.req.param('id'));
  return c.json(listMessages(id));
});

// Approvals
app.post('/api/approve', async (c) => {
  const body = await c.req.json();
  // TODO: integrar com loop de agente
  return c.json({ ok: true, decision: body.decision });
});

// Chat (SSE)
app.post('/api/chat', async (c) => {
  const body = await c.req.json();
  const mode = body.mode || 'chat';
  const convId = body.conversationId;

  const budget = checkBudget();
  if (budget.blocked) {
    return c.json({ error: 'Daily limit reached' }, 429);
  }

  // Salvar mensagem do usuário
  const userMsg = body.messages?.filter(m => m.role === 'user').pop();
  if (convId && userMsg) {
    addMessage(convId, 'user', userMsg.content);
  }

  const systemPrompt = getPersona();
  const params = {
    temperature: body.params?.temperature ?? 1,
    top_p: body.params?.top_p ?? 1,
    max_tokens: body.params?.max_tokens ?? 4096,
  };

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };

  const ac = new AbortController();
  let fullText = '';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const startTs = Date.now();
        let tokensIn = 0, tokensOut = 0;

        for await (const token of streamChat(mode, {
          messages: body.messages || [],
          systemPrompt,
          ...params,
        }, {
          onToken: (t) => {
            fullText += t;
            tokensOut += t.length / 4;
            send('token', { token: t });
          },
          onWarning: (w) => send('warning', w),
          signal: ac.signal,
        })) {
          // tokens já enviados via onToken
        }

        // Salvar resposta do assistente
        if (convId && fullText) {
          addMessage(convId, 'assistant', fullText);
        }

        incrementUsage();
        send('done', { content: fullText });
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Aborted by user' : e.message;
        send('error', { message: msg });
      } finally {
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    }
  });

  return new Response(stream, { headers });
});

// Persona
app.get('/api/persona', (c) => c.json({ content: getPersona() }));
app.put('/api/persona', async (c) => {
  const body = await c.req.json();
  await import('node:fs/promises').then(fs => fs.writeFile(
    join(__dirname, '..', 'personas', 'default.md'), body.content, 'utf-8'
  ));
  return c.json({ ok: true });
});

const PORT = 4319;
serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`📡 Heretic rodando em http://127.0.0.1:${info.port}`);
});
