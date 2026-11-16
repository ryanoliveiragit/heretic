// Vercel Routing Middleware — senha de demonstração na frente do site e da API.
// Usuário qualquer; senha = env DEMO_PASSWORD. Sem a env, o site fica fechado.
export const config = { matcher: '/:path*' };

// O navegador baixa o manifesto e os ícones do PWA sem mandar a senha; sem isso o app não fica instalável.
const PUBLIC = /^\/(manifest\.webmanifest|icons\/[\w.-]+\.(png|svg))$/;

export default function middleware(request) {
  if (PUBLIC.test(new URL(request.url).pathname)) return;
  const expected = process.env.DEMO_PASSWORD;
  const header = request.headers.get('authorization') || '';
  if (expected && header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      if (pass === expected) return; // segue para o site/API
    } catch {}
  }
  return new Response('Acesso restrito (demo).', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Heretic demo", charset="UTF-8"' },
  });
}
