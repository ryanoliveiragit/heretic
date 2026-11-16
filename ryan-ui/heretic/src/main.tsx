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

if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}); });
}
