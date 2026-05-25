// Zustand document slice — tracks the file backing the current canvas and the
// recent-files list shown in the File menu.
//
// Phase 5 (PR 2/3, sibling subagent B — file menu UX). Sibling A ships the
// persistence ENGINE (`src/shared/aimap.ts` + `window.platform.files`); this
// slice is the renderer-side STATE that the File menu and keyboard shortcuts
// read and write:
//   - `currentFile`: the opaque FileHandle of the document we're editing, or
//     null for an unsaved / never-saved ("Untitled") document. `Save` writes
//     back to this handle; `New` clears it; `Open` / `Save As` set it.
//   - `recentFiles`: the last-N files, surfaced in the File ▸ Recent submenu.
//
// Recent-files PERSISTENCE is owned by sibling A's platform layer:
//   - electron: persisted to disk via electron-store, exposed through
//     `window.platform.files.recentFiles()` (and recorded on open/save by the
//     main-process IPC handlers).
//   - web: File System Access handles can't be persisted meaningfully across
//     reloads in a portable way, so `recentFiles()` returns display names only
//     (or an empty list). Either way the renderer just renders whatever the
//     platform returns — it does NOT own the persistence.
//
// So this slice keeps a *cached copy* of the platform's recent-files list for
// synchronous render, plus the live `currentFile` handle (which is inherently
// renderer-session state — a FileHandle is not serialisable across a reload).
//
// Why a separate slice from `settings`/`selection`: the current-file handle
// and recent list are document-lifecycle concerns, change on a different
// cadence than per-render UI toggles, and are read by both the File menu and
// the (sibling C) dirty-indicator / title-bar code. Keeping them isolated
// keeps each store's subscribers from re-rendering on unrelated churn.

import { create } from "zustand";
import type { FileHandle, RecentFile } from "../../shared/platform.js";

export interface DocumentState {
  /**
   * Handle to the file backing the current document, or null for an unsaved
   * ("Untitled") document. `Save` targets this handle; `Save As` / `Open`
   * replace it; `New` clears it back to null.
   */
  currentFile: FileHandle | null;

  /**
   * Cached copy of the platform's recent-files list, for synchronous render
   * in the File ▸ Recent submenu. Refreshed via `refreshRecentFiles()` after
   * any open/save and on mount.
   */
  recentFiles: RecentFile[];

  /** Set (or clear) the current-file handle. */
  setCurrentFile(handle: FileHandle | null): void;

  /** Replace the cached recent-files list. */
  setRecentFiles(files: RecentFile[]): void;

  /**
   * Pull the authoritative recent-files list from the platform and cache it.
   * Safe to call when `window.platform` is absent (e.g. unit tests / SSR) —
   * it no-ops in that case. Never throws; logs and leaves the cache intact on
   * platform error so a flaky recents read can't break the menu.
   */
  refreshRecentFiles(): Promise<void>;
}

export const useDocument = create<DocumentState>((set) => ({
  currentFile: null,
  recentFiles: [],

  setCurrentFile: (handle) => set({ currentFile: handle }),
  setRecentFiles: (files) => set({ recentFiles: files }),

  refreshRecentFiles: async () => {
    const platform =
      typeof window !== "undefined" ? window.platform : undefined;
    if (!platform?.files?.recentFiles) return;
    try {
      const files = await platform.files.recentFiles();
      set({ recentFiles: files });
    } catch (err) {
      // Non-fatal: the menu just shows a stale / empty list. Surfacing this as
      // a crash would be worse than a missing recents entry.
      console.error("Failed to load recent files:", err);
    }
  },
}));
