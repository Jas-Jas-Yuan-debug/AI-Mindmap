import type { Platform } from "../shared/platform.js";
import { notImplemented } from "../shared/platform.js";

// Phase 0 stub: returns a Platform whose methods throw with a clear message
// until Phase 5 wires the IPC bridges. The renderer can still mount and pan
// the canvas; only file/AI/settings interactions are guarded.
export const electronPlatform: Platform = {
  kind: "electron",

  files: {
    async openCanvas() {
      notImplemented("electron.files.openCanvas");
    },
    async saveCanvas() {
      notImplemented("electron.files.saveCanvas");
    },
    async saveCanvasAs() {
      notImplemented("electron.files.saveCanvasAs");
    },
    async recentFiles() {
      return [];
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
