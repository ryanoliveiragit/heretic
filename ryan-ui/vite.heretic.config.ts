import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Build do frontend Heretic Local consumindo o design system ryan-ui (alias @ -> raiz do ryan-ui).
 *  Sai como estático em ../public para o servidor Hono (porta 4319) servir. */
const root = path.resolve(import.meta.dirname, "heretic");
const outDir = path.resolve(import.meta.dirname, "..", "public", "app");

export default defineConfig({
  root,
  base: "/app/",
  plugins: [react()],
  resolve: {
    alias: {
      "@pro": path.resolve(import.meta.dirname, "..", "ryan-ui-work/rebrand/site-impl/src/components/ryan"),
      "@": path.resolve(import.meta.dirname, "."),
    },
    dedupe: ["react", "react-dom", "motion"],
  },
  build: {
    outDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: undefined } },
  },
  server: { port: 5197, strictPort: true, host: "127.0.0.1" },
});
