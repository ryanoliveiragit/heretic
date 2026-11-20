import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

/** Build do frontend Heretic Local consumindo o design system ryan-ui (alias @ -> raiz do ryan-ui).
 *  Sai como estático em ../public para o servidor Hono (porta 4319) servir. */
const home = process.env.BUILD_HOME === "1";
const root = path.resolve(import.meta.dirname, home ? "heretic-home" : "heretic");
const outDir = home ? path.resolve(import.meta.dirname, "..", "public-home") : path.resolve(import.meta.dirname, "..", "public", "app");

export default defineConfig({
  root,
  base: home ? "/" : "/app/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@pro": path.resolve(import.meta.dirname, "..", "ryan-ui-work/rebrand/site-impl/src/components/ryan"),
      "@app": path.resolve(import.meta.dirname, "heretic/src"),
      "@beui": path.resolve(import.meta.dirname, "heretic/src/v2/beui"),
      "@": path.resolve(import.meta.dirname, "."),
    },
    dedupe: ["react", "react-dom", "motion"],
  },
  build: {
    outDir,
    emptyOutDir: true,
    assetsDir: home ? "home-assets" : "assets",
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: undefined } },
  },
  server: { port: 5197, strictPort: true, host: "127.0.0.1" },
});
