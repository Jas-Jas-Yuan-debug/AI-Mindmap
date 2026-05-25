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
  // Phase 5 PR 3/3: unsaved-changes guard on window close.
  window: {
    // Renderer → main: report the live dirty flag.
    setDirty: (dirty: boolean) =>
      ipcRenderer.send("window:dirtyChanged", dirty),
    // Main → renderer: run the in-app save/discard prompt, resolve true to
    // proceed with the close. The renderer registers this handler.
    onConfirmClose: (handler: () => Promise<boolean> | boolean) => {
      ipcRenderer.removeAllListeners("window:confirmClose");
      ipcRenderer.on("window:confirmClose", async (_e, requestId: number) => {
        let proceed = true;
        try {
          proceed = await handler();
        } catch {
          proceed = false;
        }
        ipcRenderer.send(`window:confirmClose:reply:${requestId}`, proceed);
      });
    },
  },
});
