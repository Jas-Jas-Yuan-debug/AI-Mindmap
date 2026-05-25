import type { FileHandle, Platform, RecentFile } from "../shared/platform.js";
import { notImplemented } from "../shared/platform.js";
import { parseAimapFile } from "../shared/aimap.js";
import { migrate } from "../shared/migrations/index.js";

// Web platform adapter. Uses the File System Access API
// (window.showOpenFilePicker / showSaveFilePicker) when available, with a
// download/upload fallback otherwise. Validation (Zod via parseAimapFile /
// migrate) runs here, mirroring the Electron adapter.
//
// This module is bundled into the WEB build and MUST NOT reference Electron.

const AIMAP_EXT = ".aimap";
const RECENT_KEY = "aimap.recentFiles";
const RECENT_LIMIT = 10;

// --- File System Access API surface (typed minimally to avoid lib drift) ---

interface FsaWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FsaFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FsaWritable>;
}
interface FsaWindow {
  showOpenFilePicker?: (opts?: unknown) => Promise<FsaFileHandle[]>;
  showSaveFilePicker?: (opts?: unknown) => Promise<FsaFileHandle>;
}

function fsa(): FsaWindow {
  return window as unknown as FsaWindow;
}
function hasFsa(): boolean {
  const w = fsa();
  return (
    typeof w.showOpenFilePicker === "function" &&
    typeof w.showSaveFilePicker === "function"
  );
}

// Live FileSystemFileHandles can't cross the FileHandle (plain object)
// boundary, so we cache them by a correlation id and stash the id on the
// FileHandle. saveCanvas looks the live handle back up.
let handleSeq = 0;
const liveHandles = new Map<string, FsaFileHandle>();

function trackHandle(h: FsaFileHandle): FileHandle {
  const id = `web_${++handleSeq}`;
  liveHandles.set(id, h);
  return { _tag: "FileHandle", displayName: h.name, id };
}

const pickerOpts = {
  types: [
    {
      description: "AI-Mindmap",
      accept: { "application/json": [AIMAP_EXT] },
    },
  ],
};

// --- recent files (sessionStorage-backed; cleared when the tab closes) ---

function readRecent(): RecentFile[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentFile =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as RecentFile).displayName === "string",
    );
  } catch {
    return [];
  }
}

function pushRecent(displayName: string): void {
  try {
    const existing = readRecent().filter((e) => e.displayName !== displayName);
    const next: RecentFile[] = [
      { displayName, lastOpenedAt: new Date().toISOString() },
      ...existing,
    ].slice(0, RECENT_LIMIT);
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage may be unavailable (private mode); recent is best-effort.
  }
}

// --- download / upload fallback (no FSA) -----------------------------------

function downloadJson(name: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.toLowerCase().endsWith(AIMAP_EXT) ? name : `${name}${AIMAP_EXT}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function uploadJson(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = AIMAP_EXT + ",application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file
        .text()
        .then((text) => resolve({ name: file.name, text }))
        .catch(() => resolve(null));
    };
    // If the user cancels, onchange never fires; the promise simply never
    // resolves for that interaction — acceptable for a fallback path.
    input.click();
  });
}

export const webPlatform: Platform = {
  kind: "web",

  files: {
    async openCanvas() {
      if (hasFsa()) {
        let handle: FsaFileHandle;
        try {
          const picked = await fsa().showOpenFilePicker!(pickerOpts);
          if (picked.length === 0) return null;
          handle = picked[0]!;
        } catch {
          // AbortError when the user cancels the picker.
          return null;
        }
        const file = await handle.getFile();
        const text = await file.text();
        const data = migrate(JSON.parse(text));
        pushRecent(handle.name);
        return { handle: trackHandle(handle), data };
      }
      // Fallback: <input type=file> upload.
      const picked = await uploadJson();
      if (!picked) return null;
      const data = migrate(JSON.parse(picked.text));
      pushRecent(picked.name);
      // No live handle in the fallback path; subsequent saves go through
      // saveCanvasAs (download). Hand back a handle with no id.
      return {
        handle: { _tag: "FileHandle", displayName: picked.name },
        data,
      };
    },

    async saveCanvas(handle, data) {
      const parsed = parseAimapFile(data);
      if (!parsed.ok) {
        throw new Error(`Refusing to save invalid document: ${parsed.error}`);
      }
      const text = JSON.stringify(parsed.data, null, 2);
      const live = handle.id ? liveHandles.get(handle.id) : undefined;
      if (live) {
        const writable = await live.createWritable();
        await writable.write(text);
        await writable.close();
        pushRecent(handle.displayName);
        return;
      }
      // No live handle (fallback path or expired) → download.
      downloadJson(handle.displayName, text);
      pushRecent(handle.displayName);
    },

    async saveCanvasAs(data, suggestedName) {
      const parsed = parseAimapFile(data);
      if (!parsed.ok) {
        throw new Error(`Refusing to save invalid document: ${parsed.error}`);
      }
      const text = JSON.stringify(parsed.data, null, 2);
      const name = suggestedName ?? "Untitled.aimap";
      if (hasFsa()) {
        let handle: FsaFileHandle;
        try {
          handle = await fsa().showSaveFilePicker!({
            ...pickerOpts,
            suggestedName: name.toLowerCase().endsWith(AIMAP_EXT)
              ? name
              : `${name}${AIMAP_EXT}`,
          });
        } catch {
          return null; // user cancelled
        }
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        pushRecent(handle.name);
        return trackHandle(handle);
      }
      // Fallback: download. We can't return a re-usable handle, so hand back
      // one without an id (future saves re-download).
      downloadJson(name, text);
      pushRecent(name);
      return { _tag: "FileHandle", displayName: name };
    },

    async recentFiles() {
      return readRecent();
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
      // No filesystem path concept on web — FileNode.file holds a display
      // name, not an openable path. No-op (don't throw; double-click is a
      // best-effort affordance).
    },
    async openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer");
    },
  },

  links: {
    async fetchMeta() {
      // No CORS-free way to fetch arbitrary pages from the browser. LinkNodes
      // on web show the host as their title (no enrichment). A server-proxy
      // path could be added later (decided alongside the Phase 9 web AI proxy).
      return null;
    },
  },
};
