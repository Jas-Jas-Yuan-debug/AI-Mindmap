// Main-process IPC handlers for `.mindmap` file persistence (plan §6 Phase 5).
//
// Channels (names mirror src/shared/ipc.ts — kept as string literals here
// because the main tsconfig excludes src/shared and compiles to CommonJS):
//   files:open    → show open dialog, read + JSON-parse the file
//   files:save    → write to an existing path
//   files:saveAs  → show save dialog, write to the chosen path
//   files:recent  → read the persisted recent-files list
//
// VALIDATION: Zod validation (parseAimapFile) runs in the renderer-side
// platform adapter (src/platform/electron.ts) BEFORE save is invoked and
// AFTER open returns — that layer can import the shared schema, this CommonJS
// main bundle cannot (src/shared is excluded from tsconfig.main.json and uses
// ESM). Main only performs structural fs I/O + JSON parse. The renderer
// refuses to send an invalid doc to `files:save`/`files:saveAs`, and refuses
// to surface an invalid doc from `files:open`. See electron.ts.
//
// BACK-COMPAT: The open dialog also accepts `.aimap` (the old extension) so
// existing files continue to open. New files are always saved as `.mindmap`.
// Internal symbol names (AIMAP_EXT, AimapFile, aimap.ts) are kept unchanged
// to avoid churn — only the string value and user-facing labels are updated.

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFile, writeFile, mkdir } from "fs/promises";
import * as path from "path";

const AIMAP_EXT = "mindmap";
const RECENT_LIMIT = 10;

interface FileHandleDTO {
  _tag: "FileHandle";
  displayName: string;
  path?: string;
}

interface RecentFileDTO {
  displayName: string;
  path?: string;
  lastOpenedAt: string;
}

function recentStorePath(): string {
  return path.join(app.getPath("userData"), "recent-files.json");
}

async function readRecent(): Promise<RecentFileDTO[]> {
  try {
    const raw = await readFile(recentStorePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentFileDTO =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as RecentFileDTO).displayName === "string",
    );
  } catch {
    return [];
  }
}

async function pushRecent(filePath: string): Promise<void> {
  const displayName = path.basename(filePath);
  const existing = await readRecent();
  const deduped = existing.filter((e) => e.path !== filePath);
  const next: RecentFileDTO[] = [
    { displayName, path: filePath, lastOpenedAt: new Date().toISOString() },
    ...deduped,
  ].slice(0, RECENT_LIMIT);
  const storePath = recentStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(next, null, 2), "utf8");
}

function handleFor(filePath: string): FileHandleDTO {
  return {
    _tag: "FileHandle",
    displayName: path.basename(filePath),
    path: filePath,
  };
}

/** Register the `files:*` IPC handlers. Call once from main.ts after app ready. */
export function registerFileHandlers(): void {
  // files:open — show dialog, read + JSON-parse. Returns { handle, data } or
  // null (cancelled). Throws on read/parse failure so the renderer can show a
  // friendly error.
  ipcMain.handle("files:open", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ["openFile"],
          filters: [{ name: "Mindmap", extensions: ["mindmap", "aimap"] }],
        })
      : await dialog.showOpenDialog({
          properties: ["openFile"],
          filters: [{ name: "Mindmap", extensions: ["mindmap", "aimap"] }],
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0]!;
    const raw = await readFile(filePath, "utf8");
    // JSON.parse throws on corrupt files — the renderer catches + shows a
    // friendly dialog (Zod validation happens renderer-side after this).
    const data: unknown = JSON.parse(raw);
    await pushRecent(filePath);
    return { handle: handleFor(filePath), data };
  });

  // files:save — write to an existing path. The renderer has already
  // validated `data`. Throws if the handle has no path (renderer should call
  // saveAs instead).
  ipcMain.handle(
    "files:save",
    async (_event, args: { handle: FileHandleDTO; data: unknown }) => {
      const filePath = args.handle.path;
      if (!filePath) {
        throw new Error("files:save requires a handle with a path; use files:saveAs.");
      }
      await writeFile(filePath, JSON.stringify(args.data, null, 2), "utf8");
      await pushRecent(filePath);
    },
  );

  // files:saveAs — show save dialog, write to chosen path. Returns the new
  // handle or null (cancelled).
  ipcMain.handle(
    "files:saveAs",
    async (
      event,
      args: { data: unknown; suggestedName?: string },
    ): Promise<FileHandleDTO | null> => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const defaultPath = args.suggestedName
        ? ensureExt(args.suggestedName)
        : `Untitled.${AIMAP_EXT}`;
      const result = win
        ? await dialog.showSaveDialog(win, {
            defaultPath,
            filters: [{ name: "Mindmap", extensions: [AIMAP_EXT] }],
          })
        : await dialog.showSaveDialog({
            defaultPath,
            filters: [{ name: "Mindmap", extensions: [AIMAP_EXT] }],
          });
      if (result.canceled || !result.filePath) return null;
      const filePath = ensureExt(result.filePath);
      await writeFile(filePath, JSON.stringify(args.data, null, 2), "utf8");
      await pushRecent(filePath);
      return handleFor(filePath);
    },
  );

  // files:recent — the persisted recent-files list (survives restart).
  ipcMain.handle("files:recent", async (): Promise<RecentFileDTO[]> => {
    return readRecent();
  });
}

function ensureExt(p: string): string {
  const lower = p.toLowerCase();
  // Accept both the new extension and the legacy .aimap extension so existing
  // files are not force-renamed when the user re-saves them.
  if (lower.endsWith(".mindmap") || lower.endsWith(".aimap")) return p;
  return `${p}.${AIMAP_EXT}`;
}
