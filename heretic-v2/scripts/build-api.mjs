import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Vite resolve `?raw` sozinho; o esbuild não, então o plugin faz o trabalho. */
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

async function caminhar(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await caminhar(p)));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const entries = [
  ...(await caminhar("api").catch(() => [])),
  ...(await caminhar("server").catch(() => [])),
];

if (!entries.length) {
  console.log("build-api: nada em api/ ou server/ ainda — pulando.");
  process.exit(0);
}

await build({
  entryPoints: entries,
  outdir: ".dev/check",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  plugins: [rawPlugin],
  logLevel: "warning",
});

console.log(`build-api: ${entries.length} arquivo(s) compilados.`);
