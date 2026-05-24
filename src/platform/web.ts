import type { Platform } from "../shared/platform.js";
import { notImplemented } from "../shared/platform.js";

// Phase 0 stub: mirrors the Electron stub. Phase 5 wires the File System
// Access API for files; later phases wire AI via either a server proxy or
// user-supplied sessionStorage keys.
export const webPlatform: Platform = {
  kind: "web",

  files: {
    async openCanvas() {
      notImplemented("web.files.openCanvas");
    },
    async saveCanvas() {
      notImplemented("web.files.saveCanvas");
    },
    async saveCanvasAs() {
      notImplemented("web.files.saveCanvasAs");
    },
    async recentFiles() {
      return [];
    },
  },

  ai: {
    async complete() {
      notImplemented("web.ai.complete");
    },
    async *stream() {
      notImplemented("web.ai.stream");
    },
    async hasKey() {
      return false;
    },
    async setKey() {
      notImplemented("web.ai.setKey");
    },
  },

  settings: {
    async get(k) {
      if (k === "theme") return "system" as never;
      if (k === "recentFiles") return [] as never;
      notImplemented(`web.settings.get(${String(k)})`);
    },
    async set() {
      notImplemented("web.settings.set");
    },
  },

  shell: {
    async openPath() {
      notImplemented("web.shell.openPath");
    },
    async openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer");
    },
  },
};
