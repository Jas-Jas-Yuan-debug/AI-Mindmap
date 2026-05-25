import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import { electronPlatform } from "../platform/electron.js";
import { webPlatform } from "../platform/web.js";
import type { Platform } from "../shared/platform.js";
import { installDevHelpers } from "./dev/aimPushCards.js";
import { installEdgeDevHelpers } from "./dev/aimPushEdges.js";
import { installDocStatusSubscriptions } from "./store/docStatus.js";
import "./ui/theme.css";

declare global {
  // Set by preload.ts (Electron) via contextBridge. Undefined on web.
  interface Window {
    aimBridge?: { kind: "electron"; version: string };
    platform: Platform;
  }
  // Defined by Vite (see vite.config.*.ts).
  const __PLATFORM__: "electron" | "web";
}

const platform: Platform =
  typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "electron"
    ? electronPlatform
    : webPlatform;

window.platform = platform;

// Dev-only: expose `window.__aimPushCards(n)` for the 100-card perf
// smoke test (Phase 2 §6 exit criterion 1) and `window.__aimPushEdges(n)`
// for the 100×200 edge perf smoke test (Phase 3 §6 exit criterion 1).
// Tree-shaken in prod builds.
installDevHelpers();
installEdgeDevHelpers();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Phase 5 PR 3/3 (sibling C): wire the dirty flag to the document stores. Done
// after the initial render so the first paint of a pristine canvas doesn't
// mark the document dirty. Idempotent.
installDocStatusSubscriptions();
