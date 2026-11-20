// Home do 451.sh (aprovada pelo Ryan em 19/11/2026). Mesmos componentes do /app (composer, GlassSegmented,
// TypewriterTerminal, AiWorkflow, PlushPet); o build sai em /home-assets para não misturar com o /app.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@/registry/foundation.css";
import "@app/app.css";
import "@app/v2/explore.css";
import "@app/v2/home.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Home451 } from "@app/v2/home451";

createRoot(document.getElementById("root")!).render(<StrictMode><Home451 /></StrictMode>);
