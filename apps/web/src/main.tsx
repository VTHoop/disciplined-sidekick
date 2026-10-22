import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { appTitle } from "./app-info";

registerSW({ immediate: true });

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <h1>{appTitle()}</h1>
  </StrictMode>,
);
