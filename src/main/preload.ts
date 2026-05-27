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
  // Phase 7: open files/links in the OS, and fetch link preview metadata.
  shell: {
    openPath: (p: string) => ipcRenderer.invoke("shell:openPath", p),
    openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  },
  links: {
    fetchMeta: (url: string) => ipcRenderer.invoke("links:fetchMeta", url),
  },
  // Phase 9 / 9b: AI. The renderer never sees a stored secret — only these
  // channels. setKey/clearAuth/setActiveProvider take a provider id.
  ai: {
    hasKey: () => ipcRenderer.invoke("ai:hasKey"),
    listProviders: () => ipcRenderer.invoke("ai:listProviders"),
    authStatus: () => ipcRenderer.invoke("ai:authStatus"),
    setKey: (provider: string, key: string) =>
      ipcRenderer.invoke("ai:setKey", provider, key),
    clearAuth: (provider: string) => ipcRenderer.invoke("ai:clearAuth", provider),
    startOAuth: (provider: string) => ipcRenderer.invoke("ai:startOAuth", provider),
    getActiveProvider: () => ipcRenderer.invoke("ai:getActiveProvider"),
    setActiveProvider: (provider: string) =>
      ipcRenderer.invoke("ai:setActiveProvider", provider),
    complete: (req: unknown) => ipcRenderer.invoke("ai:complete", req),
    // Callback-based stream. Returns an unsubscribe function. The renderer's
    // platform adapter wraps this into an AsyncIterable.
    stream: (id: string, req: unknown, onEvent: (ev: unknown) => void) => {
      const channel = `ai:stream:event:${id}`;
      const listener = (_e: unknown, ev: unknown) => onEvent(ev);
      ipcRenderer.on(channel, listener);
      ipcRenderer.send("ai:stream", { id, req });
      return () => ipcRenderer.removeListener(channel, listener);
    },
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
