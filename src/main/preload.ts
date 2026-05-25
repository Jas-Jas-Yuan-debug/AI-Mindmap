import { contextBridge, ipcRenderer } from "electron";

// Preload bridge: exposes a SAFE, minimal surface to the renderer over
// contextBridge. The renderer's Electron platform adapter
// (src/platform/electron.ts) calls these and never touches ipcRenderer or
// "electron" directly. Channel names mirror src/shared/ipc.ts.
//
// Phase 5 (PR 1/3): the `files:*` group. Later phases add ai/settings/shell.
contextBridge.exposeInMainWorld("aimBridge", {
  kind: "electron" as const,
  version: "0.1.0",
  files: {
    open: () => ipcRenderer.invoke("files:open"),
    save: (handle: unknown, data: unknown) =>
      ipcRenderer.invoke("files:save", { handle, data }),
    saveAs: (data: unknown, suggestedName?: string) =>
      ipcRenderer.invoke("files:saveAs", { data, suggestedName }),
    recent: () => ipcRenderer.invoke("files:recent"),
  },
});
