import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DemoApp } from "./demo/DemoApp";
import { setInputLayoutMode } from "./helpers/nodeGeometry";

// The hosted open-source demo runs entirely in the browser (no backend). It is
// enabled by the `VITE_DEMO_MODE` build flag (see `.env.demo`) or an ad-hoc
// `?demo` query param, so the same bundle can serve both the live app and the
// standalone demo.
const params = new URLSearchParams(window.location.search);
const demoMode = import.meta.env.VITE_DEMO_MODE === "true" || params.has("demo");

// The demo has a single ingress lane, so center it vertically; the live app keeps
// the two-lane (internal / ingress) split.
if (demoMode) setInputLayoutMode("center");

createRoot(document.getElementById("root")!).render(
    <StrictMode>{demoMode ? <DemoApp /> : <App />}</StrictMode>,
);
