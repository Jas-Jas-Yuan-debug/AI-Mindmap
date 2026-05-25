import type { FileHandle, Platform, RecentFile } from "../shared/platform.js";
import { notImplemented } from "../shared/platform.js";
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

interface AimBridge {
  kind: "electron";
  version: string;
  files: AimBridgeFiles;
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
    async complete() {
      notImplemented("electron.ai.complete");
    },
    async *stream() {
      notImplemented("electron.ai.stream");
    },
    async hasKey() {
      return false;
    },
    async setKey() {
      notImplemented("electron.ai.setKey");
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
    async openPath() {
      notImplemented("electron.shell.openPath");
    },
    async openExternal() {
      notImplemented("electron.shell.openExternal");
    },
  },
};
