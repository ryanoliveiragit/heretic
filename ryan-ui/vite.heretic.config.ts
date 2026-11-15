import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Build do frontend Heretic Local consumindo o design system ryan-ui (alias @ -> raiz do ryan-ui).
 *  Sai como estático em ../public para o servidor Hono (porta 4319) servir. */
const root = path.resolve(import.meta.dirname, "heretic");
const outDir = path.resolve(import.meta.dirname, "..", "public");

export default defineConfig({
  root,
  base: "/",
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  build: {
    outDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: undefined } },
  },
  server: { port: 5197, strictPort: true, host: "127.0.0.1" },
});
