// Import / Export between our `.mindmap` format and other tools' file formats
// (V2 interop). Obsidian Canvas (.canvas) and Excalidraw (.excalidraw) are
// supported — both are plain JSON, so the whole flow lives in the renderer:
//
//   import: <input type=file> → read text → JSON.parse → pure converter
//           (src/shared/interop/*) → AimapFile → load into the stores.
//   export: build an AimapFile from the live stores → pure converter →
//           JSON.stringify → Blob download.
//
// No main-process / IPC / Platform changes are needed (unlike native Save
// dialogs): a file-input + a Blob download work in BOTH the Electron renderer
// and the web build. Miro / Figma are intentionally NOT here — they have no
// open local file format (Figma `.fig` is proprietary binary, Miro is
// REST-API-only), so they're deferred to a token-based API path. See the
// "Interop (V2)" section of DEVELOPMENT_PLAN.md.
//
// An imported document has NO backing `.mindmap` file, so we drop the current
// file handle — the next Save prompts for a new `.mindmap` location.

import type { AimapFile } from "../../shared/aimap.js";
import {
  buildAimapFile,
  loadAimapFile,
  confirmDiscardIfDirty,
} from "./fileActions.js";
import { useDocument } from "../store/document.js";
import {
  obsidianToMindmap,
  mindmapToObsidian,
} from "../../shared/interop/obsidian.js";
import {
  excalidrawToMindmap,
  mindmapToExcalidraw,
} from "../../shared/interop/excalidraw.js";

/** Open a native file picker and resolve the chosen file's text (or null). */
function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((text) => resolve({ name: file.name, text }))
        .catch(() => resolve(null));
    };
    document.body.appendChild(input);
    input.click();
  });
}

/** Trigger a browser download of `text` as `filename`. Works on web + Electron. */
function downloadText(filename: string, text: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Surface an interop failure without crashing. */
function reportInteropError(verb: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${verb} failed:`, err);
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(`Could not ${verb}:\n${message}`);
  }
}

/** Shared import flow: pick a foreign file, convert it, load it as a new doc. */
async function importVia(
  label: string,
  accept: string,
  convert: (raw: unknown) => AimapFile,
): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  const picked = await pickTextFile(accept);
  if (!picked) return; // cancelled
  try {
    const raw: unknown = JSON.parse(picked.text);
    const doc = convert(raw);
    loadAimapFile(doc);
    // No backing .mindmap file yet — the next Save becomes Save As.
    useDocument.getState().setCurrentFile(null);
    await useDocument.getState().refreshRecentFiles();
  } catch (err) {
    reportInteropError(`import ${label}`, err);
  }
}

/** Shared export flow: convert the live doc and download it. */
function exportVia(
  label: string,
  ext: string,
  convert: (file: AimapFile) => unknown,
): void {
  try {
    const out = convert(buildAimapFile());
    const current = useDocument.getState().currentFile?.displayName ?? "Untitled";
    const base = current.replace(/\.(mindmap|aimap)$/i, "");
    downloadText(`${base}${ext}`, JSON.stringify(out, null, 2));
  } catch (err) {
    reportInteropError(`export ${label}`, err);
  }
}

// --- Public actions (wired into the main menu) ------------------------------

export async function importFromObsidian(): Promise<void> {
  await importVia("Obsidian Canvas", ".canvas,application/json", obsidianToMindmap);
}

export async function importFromExcalidraw(): Promise<void> {
  await importVia("Excalidraw", ".excalidraw,application/json", excalidrawToMindmap);
}

export async function exportToObsidian(): Promise<void> {
  exportVia("Obsidian Canvas", ".canvas", mindmapToObsidian);
}

export async function exportToExcalidraw(): Promise<void> {
  exportVia("Excalidraw", ".excalidraw", mindmapToExcalidraw);
}
