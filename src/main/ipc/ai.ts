// Main-process IPC handlers for AI (Phase 9). The renderer never sees the API
// key — it only invokes these channels:
//   ai:hasKey   (invoke) → boolean
//   ai:setKey   (invoke) → void           (empty string clears the key)
//   ai:complete (invoke) → { ok, response } | { ok:false, error }
//   ai:stream   (on)     → streams ai:stream:event:<id> back to the sender
//
// Provider: AnthropicProvider in production. With no key configured, calls
// reject with a classified `no_key` error so the renderer can show
// "configure in Settings" (plan §6 Phase 9 exit criterion). Tests use
// MockProvider directly and never hit this module / the network.

import { ipcMain } from "electron";
import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";
import { AnthropicProvider, classifyError } from "../ai/anthropic.js";
import { hasKey, setKey } from "../ai/keyStore.js";
import type { AIRequest } from "../ai/provider.js";

const provider = new AnthropicProvider();

export function registerAiHandlers(): void {
  ipcMain.handle("ai:hasKey", async () => hasKey());

  ipcMain.handle("ai:setKey", async (_e: IpcMainInvokeEvent, key: string) => {
    await setKey(typeof key === "string" ? key : "");
  });

  ipcMain.handle("ai:complete", async (_e: IpcMainInvokeEvent, req: AIRequest) => {
    try {
      const response = await provider.complete(req);
      return { ok: true as const, response };
    } catch (err) {
      return { ok: false as const, error: classifyError(err) };
    }
  });

  // Streaming: the renderer sends { id, req }; we push chunk/done/error events
  // on a per-request reply channel so multiple streams can run concurrently.
  ipcMain.on("ai:stream", async (e: IpcMainEvent, payload: { id: string; req: AIRequest }) => {
    const { id, req } = payload;
    const channel = `ai:stream:event:${id}`;
    try {
      for await (const chunk of provider.stream(req)) {
        if (e.sender.isDestroyed()) return;
        e.sender.send(channel, { type: "chunk", delta: chunk.delta, done: chunk.done });
      }
      if (!e.sender.isDestroyed()) e.sender.send(channel, { type: "done" });
    } catch (err) {
      if (!e.sender.isDestroyed()) {
        e.sender.send(channel, { type: "error", error: classifyError(err) });
      }
    }
  });
}
