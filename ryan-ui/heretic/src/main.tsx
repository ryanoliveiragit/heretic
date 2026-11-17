import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/inter";
import "@/registry/foundation.css";
import "./app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HereticChat } from "./HereticChat";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HereticChat />
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
