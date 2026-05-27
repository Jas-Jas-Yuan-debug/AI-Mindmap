import type {
  AIChunk,
  AIRequest,
  AIResponse,
  AuthStatus,
  FileHandle,
  LinkMeta,
  Platform,
  ProviderId,
  ProviderMeta,
  RecentFile,
} from "../shared/platform.js";
import { notImplemented } from "../shared/platform.js";
import { makeId } from "../shared/aimap.js";
import type { AimapFile } from "../shared/aimap.js";
import { parseAimapFile } from "../shared/aimap.js";
import { migrate } from "../shared/migrations/index.js";

// Electron platform adapter. Talks to the main process via the `aimBridge`
// surface exposed in src/main/preload.ts (contextBridge → ipcRenderer.invoke).
//
// Validation boundary: this adapter is the place where the shared Zod schema
// runs, because the CommonJS main bundle can't import it. On open we `migrate`
// (forward-migrate + validate) the raw JSON; on save we `parseAimapFile` and
// REFUSE to write an invalid document (plan §6: "Save validates against Zod
// before writing").

interface AimBridgeFiles {
  open(): Promise<{ handle: FileHandle; data: unknown } | null>;
  save(handle: FileHandle, data: AimapFile): Promise<void>;
  saveAs(data: AimapFile, suggestedName?: string): Promise<FileHandle | null>;
  recent(): Promise<RecentFile[]>;
}

interface AimBridgeShell {
  openPath(p: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}

interface AimBridgeLinks {
  fetchMeta(url: string): Promise<LinkMeta | null>;
}

type AiStreamEvent =
  | { type: "chunk"; delta: string; done: boolean }
  | { type: "done" }
  | { type: "error"; error: { kind: string; message: string } };

interface AimBridgeAi {
  hasKey(): Promise<boolean>;
  listProviders(): Promise<ProviderMeta[]>;
  authStatus(): Promise<Record<ProviderId, AuthStatus>>;
  setKey(provider: ProviderId, key: string): Promise<void>;
  clearAuth(provider: ProviderId): Promise<void>;
  getActiveProvider(): Promise<ProviderId>;
  setActiveProvider(provider: ProviderId): Promise<void>;
  complete(
    req: AIRequest,
  ): Promise<
    { ok: true; response: AIResponse } | { ok: false; error: { kind: string; message: string } }
  >;
  stream(id: string, req: AIRequest, onEvent: (ev: AiStreamEvent) => void): () => void;
}

interface AimBridge {
  kind: "electron";
  version: string;
  files: AimBridgeFiles;
  shell?: AimBridgeShell;
  links?: AimBridgeLinks;
  ai?: AimBridgeAi;
}

/** Thrown by platform.ai.complete on failure; carries the classified kind. */
export class AIErrorException extends Error {
  readonly kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
  }
}

function bridge(): AimBridge {
  const b = (window as unknown as { aimBridge?: AimBridge }).aimBridge;
  if (!b || !b.files) {
    throw new Error(
      "Electron bridge not available — preload did not expose aimBridge.files.",
    );
  }
  return b;
}

export const electronPlatform: Platform = {
  kind: "electron",

  files: {
    async openCanvas() {
      const res = await bridge().files.open();
      if (!res) return null;
      // Forward-migrate + validate. Throws MigrationError on corrupt/invalid
      // docs so the file-menu layer can show a friendly error.
      const data = migrate(res.data);
      return { handle: res.handle, data };
    },

    async saveCanvas(handle, data) {
      const parsed = parseAimapFile(data);
      if (!parsed.ok) {
        throw new Error(`Refusing to save invalid document: ${parsed.error}`);
      }
      await bridge().files.save(handle, parsed.data);
    },

    async saveCanvasAs(data, suggestedName) {
      const parsed = parseAimapFile(data);
      if (!parsed.ok) {
        throw new Error(`Refusing to save invalid document: ${parsed.error}`);
      }
      return bridge().files.saveAs(parsed.data, suggestedName);
    },

    async recentFiles() {
      return bridge().files.recent();
    },
  },

  ai: {
    async hasKey() {
      return (await bridge().ai?.hasKey()) ?? false;
    },
    async listProviders(): Promise<ProviderMeta[]> {
      return (await bridge().ai?.listProviders()) ?? [];
    },
    async authStatus(): Promise<Record<ProviderId, AuthStatus>> {
      return (
        (await bridge().ai?.authStatus()) ?? ({} as Record<ProviderId, AuthStatus>)
      );
    },
    async setKey(provider: ProviderId, key: string) {
      await bridge().ai?.setKey(provider, key);
    },
    async clearAuth(provider: ProviderId) {
      await bridge().ai?.clearAuth(provider);
    },
    async getActiveProvider(): Promise<ProviderId> {
      return (await bridge().ai?.getActiveProvider()) ?? "anthropic";
    },
    async setActiveProvider(provider: ProviderId) {
      await bridge().ai?.setActiveProvider(provider);
    },
    async complete(req: AIRequest): Promise<AIResponse> {
      const ai = bridge().ai;
      if (!ai) throw new AIErrorException("no_key", "AI bridge unavailable.");
      const r = await ai.complete(req);
      if (!r.ok) throw new AIErrorException(r.error.kind, r.error.message);
      return r.response;
    },
    stream(req: AIRequest): AsyncIterable<AIChunk> {
      const ai = bridge().ai;
      if (!ai) {
        // Surface as a one-shot error chunk-less iterable that throws on use.
        return (async function* () {
          throw new AIErrorException("no_key", "AI bridge unavailable.");
        })();
      }
      // Adapt the callback bridge into an async iterable via a small queue.
      const id = makeId("aistream");
      const queue: AIChunk[] = [];
      let resolveNext: (() => void) | null = null;
      let finished = false;
      let failure: AIErrorException | null = null;
      const wake = () => {
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r();
        }
      };
      const unsubscribe = ai.stream(id, req, (ev) => {
        if (ev.type === "chunk") {
          queue.push({ delta: ev.delta, done: ev.done });
        } else if (ev.type === "done") {
          finished = true;
        } else {
          failure = new AIErrorException(ev.error.kind, ev.error.message);
          finished = true;
        }
        wake();
      });
      return {
        async *[Symbol.asyncIterator]() {
          try {
            while (true) {
              if (queue.length > 0) {
                yield queue.shift()!;
                continue;
              }
              if (failure) throw failure;
              if (finished) return;
              await new Promise<void>((res) => (resolveNext = res));
            }
          } finally {
            unsubscribe();
          }
        },
      };
    },
  },

  settings: {
    async get(k) {
      if (k === "theme") return "system" as never;
      if (k === "recentFiles") return [] as never;
      notImplemented(`electron.settings.get(${String(k)})`);
    },
    async set() {
      notImplemented("electron.settings.set");
    },
  },

  shell: {
    async openPath(p) {
      await bridge().shell?.openPath(p);
    },
    async openExternal(url) {
      await bridge().shell?.openExternal(url);
    },
  },

  links: {
    async fetchMeta(url) {
      const b = bridge();
      if (!b.links) return null;
      return b.links.fetchMeta(url);
    },
  },
};
