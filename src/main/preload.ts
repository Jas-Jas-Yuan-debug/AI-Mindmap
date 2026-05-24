import { contextBridge } from "electron";

// Minimal preload bridge. Phase 5+ fills this in with the full Platform
// interface methods (files, ai, settings, shell) backed by ipcRenderer.invoke.
contextBridge.exposeInMainWorld("aimBridge", {
  kind: "electron" as const,
  version: "0.1.0",
});
