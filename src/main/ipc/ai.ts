// Main-process IPC handlers for AI (Phase 9 + 9b multi-provider). The renderer
// never sees a stored secret — it only invokes these channels:
//   ai:hasKey          (invoke) → boolean        (is the ACTIVE provider configured?)
//   ai:listProviders   (invoke) → ProviderMeta[]
//   ai:authStatus      (invoke) → Record<ProviderId, AuthStatus>
//   ai:setKey          (invoke, providerId, key) → void   (empty key clears)
//   ai:clearAuth       (invoke, providerId) → void
//   ai:getActiveProvider (invoke) → ProviderId
//   ai:setActiveProvider (invoke, providerId) → void
//   ai:complete        (invoke, req) → { ok, response } | { ok:false, error }
//   ai:stream          (on)     → streams ai:stream:event:<id> back to the sender
//
// complete/stream resolve the provider from `req.providerId` (when present and
// valid) else the persisted active provider. With no credential configured the
// call rejects with a classified `no_key` error so the renderer can show
// "configure in Settings". Tests use MockProvider directly and never hit this
// module / the network.

import { ipcMain } from "electron";
import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";
import { classifyError } from "../ai/errors.js";
import { getProvider } from "../ai/registry.js";
import {
  allAuthStatus,
  clearCredential,
  getActiveProvider,
  setActiveProvider,
  setApiKey,
  authStatus,
} from "../ai/credentials.js";
import { PROVIDERS, isProviderId } from "../ai/types.js";
import type { ProviderId } from "../ai/types.js";
import type { AIRequest } from "../ai/provider.js";

/** Renderer request payload: an AIRequest plus an optional provider override. */
interface AiCallPayload extends AIRequest {
  providerId?: string;
}

/** Resolve which provider a call targets: explicit valid id, else the active. */
async function resolveProviderId(payload: AiCallPayload): Promise<ProviderId> {
  if (isProviderId(payload.providerId)) return payload.providerId;
  return getActiveProvider();
}

export function registerAiHandlers(): void {
  ipcMain.handle("ai:hasKey", async () => {
    const active = await getActiveProvider();
    return (await authStatus(active)).configured;
  });

  ipcMain.handle("ai:listProviders", async () => PROVIDERS);

  ipcMain.handle("ai:authStatus", async () => allAuthStatus());

  ipcMain.handle(
    "ai:setKey",
    async (_e: IpcMainInvokeEvent, providerId: string, key: string) => {
      if (!isProviderId(providerId)) return;
      await setApiKey(providerId, typeof key === "string" ? key : "");
    },
  );

  ipcMain.handle(
    "ai:clearAuth",
    async (_e: IpcMainInvokeEvent, providerId: string) => {
      if (!isProviderId(providerId)) return;
      await clearCredential(providerId);
    },
  );

  ipcMain.handle("ai:getActiveProvider", async () => getActiveProvider());

  ipcMain.handle(
    "ai:setActiveProvider",
    async (_e: IpcMainInvokeEvent, providerId: string) => {
      if (!isProviderId(providerId)) return;
      await setActiveProvider(providerId);
    },
  );

  ipcMain.handle("ai:complete", async (_e: IpcMainInvokeEvent, req: AiCallPayload) => {
    try {
      const id = await resolveProviderId(req);
      const response = await getProvider(id).complete(req);
      return { ok: true as const, response };
    } catch (err) {
      return { ok: false as const, error: classifyError(err) };
    }
  });

  // Streaming: the renderer sends { id, req }; we push chunk/done/error events
  // on a per-request reply channel so multiple streams can run concurrently.
  ipcMain.on(
    "ai:stream",
    async (e: IpcMainEvent, payload: { id: string; req: AiCallPayload }) => {
      const { id, req } = payload;
      const channel = `ai:stream:event:${id}`;
      try {
        const providerId = await resolveProviderId(req);
        const provider = getProvider(providerId);
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
    },
  );
}
