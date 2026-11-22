// Local dev server — wraps the shared Hono app with static file serving.
// On Vercel, api/[[...route]].js handles API only; static files are served by the CDN.

import { serve } from '@hono/node-server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { app } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

// Carregar .env manualmente
try {
  const envFile = await readFile(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.jsx': 'application/javascript; charset=utf-8',
};

async function serveStatic(c, relPath) {
  const filePath = join(PUBLIC_DIR, relPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return c.text('Forbidden', 403);
  if (!existsSync(filePath)) return c.text('Not found', 404);
  const data = await readFile(filePath);
  const mime = MIME[extname(filePath)] || 'application/octet-stream';
  return new Response(data, { headers: { 'Content-Type': mime } });
}

// Static files (local dev only): chat em / e /app/, página de apresentação em /sobre, celular em /m.html.
app.get('*', async (c) => {
  let rel = decodeURIComponent(new URL(c.req.url).pathname);
  if (rel.startsWith('/api/')) return c.text('Not found', 404);
  // Dono 21/11: o site abre direto no chat; a página de apresentação fica em /sobre (igual ao vercel.json).
  if (rel === '/') rel = '/app/index.html';
  else if (rel === '/sobre') rel = '/sobre.html';
  else if (rel.endsWith('/')) rel += 'index.html';
  return serveStatic(c, rel.replace(/^\/+/, ''));
});

const PORT = process.env.PORT || 4319;
serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`📡 Heretic rodando em http://localhost:${info.port}`);
});
