import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/inter";
import "@/registry/foundation.css";
import "./app.css";
import "./v2/explore.css";
import "./v2/beui.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App451 } from "./v2/app451";

/* iPhone com o app instalado: a altura de tela vem sem a barra de status e sobra um vão embaixo.
   Medimos a tela inteira e passamos como --app-h (dono 19/11: "tem um buraco no pwa"). */
function alturaApp() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!ios || !instalado) { document.documentElement.style.removeProperty("--app-h"); return; }
  const retrato = window.matchMedia("(orientation: portrait)").matches;
  const tela = retrato ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  document.documentElement.style.setProperty("--app-h", `${Math.max(tela, window.innerHeight)}px`);
}
alturaApp();
window.addEventListener("resize", alturaApp);
window.addEventListener("orientationchange", () => setTimeout(alturaApp, 250));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App451 />
  </StrictMode>,
);

// PWA auto-update: registra o service worker e recarrega sozinho quando entra uma versão nova.
// start_url do manifesto é /app/, então este é o ponto que mantém o app instalado em dia.
if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // só recarrega quando um SW NOVO assume uma página que já era controlada (evita recarregar na 1ª visita)
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      reg.update();
      setInterval(() => reg.update(), 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update();
      });
    }).catch(() => {});
  });
}
