// Zustand document-status slice — the "is the current document dirty?" flag and
// the timestamp of the last successful save.
//
// Phase 5 (PR 3/3, sibling subagent C — autosave + dirty indicator). This slice
// is deliberately tiny and decoupled from the file-lifecycle `document` store
// (which owns the FileHandle + recents). It exists so that:
//   - the title-bar dirty indicator (`AI-Mindmap — <name> •`),
//   - the autosave hook (`persistence/useAutosave.ts`),
//   - and the "unsaved changes" prompt before New/Open/close
// all read a single source of truth that flips to `dirty` on any edit and back
// to clean on any save / open / new.
//
// Wiring (who calls what):
//   - `markDirty()` — fired by `installDocStatusSubscriptions()` (below) on any
//     change to nodes / edges / viewport. Also safe to call manually.
//   - `markSaved()` — fired by `fileActions` on New / Open / Save / Save As (via
//     the `noteSaved()` helper there) and by the autosave hook after a write.
//
// Why a separate store from `document.ts`: dirty churns on every keystroke /
// drag tick, whereas `currentFile` + recents change only on file-lifecycle
// events. Isolating them keeps the title-bar effect (which subscribes to dirty)
// from re-running on unrelated document-store writes, and vice-versa.

import { create } from "zustand";
import { useNodes } from "./nodes.js";
import { useEdges } from "./edges.js";
import { useViewport } from "./viewport.js";

export interface DocStatusState {
  /** True when the live document has unsaved edits relative to the last save. */
  dirty: boolean;
  /** Epoch-ms of the last successful save / load / new, or null if never. */
  lastSavedAt: number | null;

  /** Mark the document dirty (called on any node/edge/viewport edit). */
  markDirty(): void;
  /**
   * Mark the document clean and stamp `lastSavedAt`. Called on a successful
   * save, and also on New / Open (a freshly-loaded or empty doc is "clean").
   * The optional `at` arg is a test seam for a deterministic timestamp.
   */
  markSaved(at?: number): void;
}

export const useDocStatus = create<DocStatusState>((set) => ({
  dirty: false,
  lastSavedAt: null,

  markDirty: () =>
    // Avoid a redundant state write (and the subscriber churn it causes) when
    // we're already dirty — every keystroke would otherwise notify the title
    // effect for no visible change.
    set((s) => (s.dirty ? s : { dirty: true })),

  markSaved: (at?: number) =>
    set({ dirty: false, lastSavedAt: at ?? Date.now() }),
}));

// ---------------------------------------------------------------------------
// Change subscriptions
// ---------------------------------------------------------------------------

let installed = false;

/**
 * Subscribe the dirty flag to the document stores: any change to the nodes,
 * edges, or viewport arrays/values flips `dirty` to true. Idempotent — calling
 * it more than once is a no-op (returns the existing teardown).
 *
 * NOT called at import time so that unit tests can drive the store directly
 * without spurious subscriptions; `src/renderer/main.tsx` installs it once at
 * app start, after the initial render, so the very first paint doesn't mark a
 * pristine document dirty.
 *
 * Returns a teardown that removes all three subscriptions.
 */
let teardown: () => void = () => {};

export function installDocStatusSubscriptions(): () => void {
  if (installed) return teardown;
  installed = true;

  const mark = () => useDocStatus.getState().markDirty();

  // Subscribe to the whole store (not a selector) — any mutation that changes
  // the nodes/edges array identity or a viewport value counts as an edit. The
  // store setters already replace the array on every mutation, so identity
  // comparison is sufficient and cheap.
  const unNodes = useNodes.subscribe((s, prev) => {
    if (s.nodes !== prev.nodes) mark();
  });
  const unEdges = useEdges.subscribe((s, prev) => {
    if (s.edges !== prev.edges) mark();
  });
  const unViewport = useViewport.subscribe((s, prev) => {
    if (s.x !== prev.x || s.y !== prev.y || s.zoom !== prev.zoom) mark();
  });

  teardown = () => {
    unNodes();
    unEdges();
    unViewport();
    installed = false;
    teardown = () => {};
  };
  return teardown;
}
