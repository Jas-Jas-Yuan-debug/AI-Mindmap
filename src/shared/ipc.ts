// Electron IPC channel names + payload types shared by the main process
// (ipcMain.handle), the preload bridge (ipcRenderer.invoke), and the
// Electron platform adapter.
//
// Keep channel names here as the single source of truth so a typo can't drift
// between the handler and the caller. Phase 5 (PR 1/3) defines the `files:*`
// group; later phases add `ai:*` / `settings:*`.

import type { AimapFile } from "./aimap.js";
import type { FileHandle, RecentFile } from "./platform.js";

/** File-persistence IPC channels (plan §6 Phase 5). */
export const FILE_CHANNELS = {
  open: "files:open",
  save: "files:save",
  saveAs: "files:saveAs",
  recent: "files:recent",
} as const;

/**
 * Window-lifecycle IPC channels (Phase 5 PR 3/3 — unsaved-changes guard).
 *   - `window:dirtyChanged` (renderer → main): the renderer reports the live
 *     dirty flag so the main process can intercept window close.
 *   - `window:confirmClose` (main → renderer, invoke): main asks the renderer
 *     to run its own save/discard prompt and resolve whether to proceed with
 *     the close. Returns `true` to close, `false` to keep the window open.
 */
export const WINDOW_CHANNELS = {
  dirtyChanged: "window:dirtyChanged",
  confirmClose: "window:confirmClose",
} as const;

/** Result of `files:open` — null when the user cancelled the dialog. */
export type FilesOpenResult = { handle: FileHandle; data: AimapFile } | null;

/** Args for `files:save` (write to an existing handle). */
export interface FilesSaveArgs {
  handle: FileHandle;
  data: AimapFile;
}

/** Args for `files:saveAs` (pick a new path, then write). */
export interface FilesSaveAsArgs {
  data: AimapFile;
  suggestedName?: string;
}

export type FilesSaveAsResult = FileHandle | null;

export type FilesRecentResult = RecentFile[];
