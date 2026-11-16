// Heretic — service worker do PWA.
// Arquivos fixos (design system, vendor, assets do app, ícones, fontes): cache primeiro.
// Páginas HTML: rede primeiro, cache se estiver offline. API: nunca entra no cache.
const VERSION = "heretic-mwj7fmzg"; // trocado a cada build: o cache antigo é apagado no activate
const SHELL = ["/", "/m.html", "/app/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Só o que tem nome fixo por versão vai em cache primeiro. Scripts da raiz (heretic-*.js, support.js) mudam sem trocar de nome: rede primeiro.
const isStatic = (url) =>
  /^\/(_ds|vendor|app\/assets|icons|uploads)\//.test(url.pathname) || /\.(woff2?)$/.test(url.pathname);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  if (isStatic(url)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html") || /\.(js|css)$/.test(url.pathname)) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("/app/"))),
    );
  }
});
