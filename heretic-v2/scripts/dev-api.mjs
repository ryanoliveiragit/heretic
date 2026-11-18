/**
 * Ponte local para as edge functions: empacota cada api/*.ts com esbuild
 * (loader de ?raw) e serve em http://localhost:3000/api/<nome>.
 * Rode com `npm run api` — lê .env por --env-file.
 */
import { build } from "esbuild";
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PORTA = Number(process.env.PORT ?? 3000);
const rawPlugin = {
  name: "raw",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({
      path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, "")),
      namespace: "file",
    }));
    b.onLoad({ filter: /\.md$/ }, async (a) => ({
      contents: await readFile(a.path, "utf8"),
      loader: "text",
    }));
  },
};

const arquivos = (await readdir("api")).filter((f) => f.endsWith(".ts"));
await build({
  entryPoints: arquivos.map((f) => `api/${f}`),
  outdir: ".dev/handlers",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  plugins: [rawPlugin],
  logLevel: "warning",
});

const rotas = new Map();
for (const f of arquivos) {
  const nome = f.replace(/\.ts$/, "");
  const mod = await import(pathToFileURL(path.resolve(`.dev/handlers/${nome}.mjs`)).href);
  rotas.set(nome, mod.default);
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const nome = url.pathname.replace(/^\/api\//, "").split("/")[0];
  const handler = rotas.get(nome);
  if (!handler) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "rota não existe", code: "invalid_request" } }));
    return;
  }

  const corpo = req.method === "GET" || req.method === "HEAD" ? undefined : req;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const ac = new AbortController();
  req.on("close", () => ac.abort());

  try {
    const resposta = await handler(new Request(url, { method: req.method, headers, body: corpo, duplex: "half", signal: ac.signal }));
    const cabecalhos = {};
    resposta.headers.forEach((v, k) => (cabecalhos[k] = v));
    res.writeHead(resposta.status, cabecalhos);
    if (!resposta.body) return res.end();
    const leitor = resposta.body.getReader();
    const empurrar = async () => {
      while (true) {
        const { done, value } = await leitor.read();
        if (done) return res.end();
        if (!res.write(Buffer.from(value))) await new Promise((r) => res.once("drain", r));
      }
    };
    await empurrar();
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: String(e?.message ?? e), code: "internal" } }));
  }
});

servidor.listen(PORTA, () => console.log(`heretic api em http://localhost:${PORTA}`));
