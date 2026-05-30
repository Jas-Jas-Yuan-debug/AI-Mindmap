// File operations behind the File menu + keyboard shortcuts.
//
// Phase 5 (PR 2/3, sibling subagent B — file menu UX). This module is the
// single seam between the renderer's Zustand stores and sibling A's
// persistence engine (`src/shared/serialize.ts` + `src/shared/aimap.ts` +
// `window.platform.files`). Every engine import is funneled through here so
// that reconciling with A's exact exports touches ONE file.
//
// Contract consumed (published by sibling A, PR #32):
//   - `AimapFile` (from `src/shared/aimap.ts`) — the on-disk document shape
//     (plan §5).
//   - `toAimapFile({ nodes, edges, viewport, ... })` / `fromAimapFile(doc)`
//     (from `src/shared/serialize.ts`) — pure (de)serialize between the live
//     store shape and an `AimapFile`. `APP_VERSION` also lives in serialize.ts.
//   - `window.platform.files.{openCanvas, saveCanvas, saveCanvasAs,
//     recentFiles}` — the platform file I/O (electron + web). `openCanvas`
//     resolves to `{ handle, data: AimapFile } | null`; Zod validation runs
//     inside the platform adapter, not here.
//
// NOTE(claude-jjy, Phase 5 B): originally coded against a contract sketch with
// `toAimapFile`/`fromAimapFile` in `aimap.ts`; on rebase onto A's merged PR #32
// those moved to `serialize.ts` (aimap.ts now owns only the schema types + Zod
// `parseAimapFile`). Import sources reconciled accordingly; the call shapes
// matched A's `ToAimapArgs`/`FromAimapResult` as-is. The two adapter helpers
// (`buildAimapFile` / `loadAimapFile`) remain the only engine call sites.

import {
  toAimapFile,
  fromAimapFile,
  APP_VERSION,
} from "../../shared/serialize.js";
import type { AimapFile } from "../../shared/aimap.js";
import type { FileHandle } from "../../shared/platform.js";

import { useNodes, type AimapNode } from "../store/nodes.js";
import { useEdges, type Edge } from "../store/edges.js";
import { useViewport } from "../store/viewport.js";
import { useHistory } from "../store/history.js";
import { useSelection } from "../store/selection.js";
import { useEdgeSelection } from "../store/edgeSelection.js";
import { useDocument } from "../store/document.js";
import { useDocStatus } from "../store/docStatus.js";

/** The platform adapter, or undefined in non-browser contexts (tests/SSR). */
function platform() {
  return typeof window !== "undefined" ? window.platform : undefined;
}

/**
 * Build an `AimapFile` from the live document (nodes + edges + viewport).
 *
 * Delegates to A's `toAimapFile`. Kept as a one-line adapter so the rest of
 * this module never imports `aimap.ts` directly — if A's signature differs,
 * this is the only call site to touch.
 */
export function buildAimapFile(): AimapFile {
  const nodes = useNodes.getState().nodes;
  const edges = useEdges.getState().edges;
  const { x, y, zoom } = useViewport.getState();
  return toAimapFile({
    nodes,
    edges,
    viewport: { x, y, zoom },
    appVersion: APP_VERSION,
  });
}

/**
 * Load an `AimapFile` into the live stores: nodes, edges, viewport. Clears
 * history (a freshly-opened doc has no undo past) and any stale selection.
 *
 * Delegates to A's `fromAimapFile` to destructure the document. The cast
 * keeps us decoupled from whether A's store node/edge types are the same
 * nominal types as the renderer's (they're structurally identical per plan
 * §5; A's renderer-facing shapes match `AimapNode`/`Edge`).
 */
export function loadAimapFile(doc: AimapFile): void {
  const { nodes, edges, viewport } = fromAimapFile(doc);

  useNodes.setState({ nodes: nodes as AimapNode[] });
  useEdges.setState({ edges: edges as Edge[] });
  useViewport.getState().setViewport({
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  });

  // A freshly-loaded document starts with a clean slate: no undo history,
  // nothing selected.
  useHistory.getState().clear();
  useSelection.getState().clear();
  useEdgeSelection.getState().clear();
}

/**
 * Reset the canvas to an empty document: no nodes, no edges, viewport at
 * origin, clean history, nothing selected, no backing file. Used by `New`.
 */
function resetToEmptyDocument(): void {
  useNodes.setState({ nodes: [] });
  useEdges.setState({ edges: [] });
  useViewport.getState().reset();
  useHistory.getState().clear();
  useSelection.getState().clear();
  useEdgeSelection.getState().clear();
  useDocument.getState().setCurrentFile(null);
}

/**
 * Mark the document clean (Phase 5 PR 3/3, sibling C). A freshly opened / new /
 * saved document has no unsaved edits, so we reset the dirty flag here. This
 * runs AFTER the store mutations above so the `markDirty` subscriptions those
 * mutations fire are overridden by the clean stamp on the same tick.
 */
function noteSaved(): void {
  useDocStatus.getState().markSaved();
}

/**
 * File ▸ New. Clears the canvas to an empty document and drops the backing
 * file handle.
 *
 * Dirty-state guarding (the "Unsaved changes" prompt) is sibling C's scope
 * (autosave / dirty flag). We optional-chain into C's hook if it has merged
 * so the prompt works end-to-end; if C hasn't merged yet this is a no-op
 * guard and C will wire the confirmation in their PR.
 */
export async function newDocument(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  resetToEmptyDocument();
  noteSaved();
}

/**
 * File ▸ Open. Asks the platform for a file via its open dialog (filtered to
 * `.aimap`), parses + validates it, loads it into the stores, and records the
 * returned handle as the current file.
 *
 * `openCanvas()` returns `null` when the user cancels the dialog — we treat
 * that as a no-op (not an error).
 */
export async function openDocument(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  const p = platform();
  if (!p?.files?.openCanvas) return;

  let result: Awaited<ReturnType<typeof p.files.openCanvas>>;
  try {
    result = await p.files.openCanvas();
  } catch (err) {
    reportFileError("open", err);
    return;
  }
  if (!result) return; // user cancelled

  try {
    loadAimapFile(result.data);
    useDocument.getState().setCurrentFile(result.handle);
    // A freshly-loaded document is clean (Phase 5 PR 3/3). Stamp AFTER the
    // store writes above so their markDirty subscriptions are overridden.
    noteSaved();
  } catch (err) {
    // Parse / validation already happened in the platform (Zod at the load
    // boundary, per plan §5); a throw here means the doc shape surprised us.
    reportFileError("open", err);
    return;
  }
  await useDocument.getState().refreshRecentFiles();
}

/**
 * File ▸ Open Recent (one entry). The renderer currently re-runs the platform
 * open flow because FileHandles for recents are not retained across reload on
 * every platform; sibling A's `recentFiles()` returns display metadata, and
 * re-opening goes through the same dialog-or-handle path A exposes.
 *
 * On electron, A's platform may accept the recent path directly; until that
 * richer signature lands, clicking a recent entry triggers the standard Open
 * dialog so the feature is never dead. NOTE(claude-jjy): revisit once A's
 * `openCanvas` accepts an optional handle/path argument.
 */
export async function openRecent(_file: { displayName: string }): Promise<void> {
  await openDocument();
}

/**
 * File ▸ Save. If a backing file exists, write back to it. Otherwise behave as
 * Save As (prompt for a location).
 */
export async function saveDocument(): Promise<void> {
  const p = platform();
  if (!p?.files) return;

  const handle = useDocument.getState().currentFile;
  if (!handle) {
    await saveDocumentAs();
    return;
  }

  const data = buildAimapFile();
  try {
    await p.files.saveCanvas(handle, data);
  } catch (err) {
    reportFileError("save", err);
    return;
  }
  noteSaved();
  await useDocument.getState().refreshRecentFiles();
}

/**
 * File ▸ Save As. Prompt the platform for a new location, write the document,
 * and record the returned handle as the current file. A `null` return means
 * the user cancelled the dialog (no-op).
 */
export async function saveDocumentAs(): Promise<void> {
  const p = platform();
  if (!p?.files?.saveCanvasAs) return;

  const data = buildAimapFile();
  const suggestedName = useDocument.getState().currentFile?.displayName;

  let handle: FileHandle | null;
  try {
    handle = await p.files.saveCanvasAs(data, suggestedName);
  } catch (err) {
    reportFileError("save", err);
    return;
  }
  if (!handle) return; // user cancelled

  useDocument.getState().setCurrentFile(handle);
  noteSaved();
  await useDocument.getState().refreshRecentFiles();
}

/**
 * Dirty-state guard. The dirty flag + prompt UI live in sibling C's
 * `docStatus` store + `UnsavedChangesDialog`; we call their global hook if
 * present so `New` / `Open` prompt before discarding unsaved work. Returns
 * `true` to proceed, `false` to abort.
 *
 * The hook is async (it shows a modal and resolves when the user picks Save /
 * Don't Save / Cancel), so we `await` it. When the hook is absent (unit tests
 * / SSR / before C's UI mounts) we proceed unconditionally.
 */
export async function confirmDiscardIfDirty(): Promise<boolean> {
  const fn =
    typeof window !== "undefined"
      ? window.__aimConfirmDiscard
      : undefined;
  if (typeof fn !== "function") return true;
  return await fn();
}

/**
 * Surface a file error to the user without crashing the app. Sibling C owns
 * the friendly error-dialog UI (plan §6 "corrupt file → friendly error
 * dialog"); we optional-chain into it if present, otherwise fall back to
 * console + alert so the failure is never silent.
 */
function reportFileError(op: "open" | "save", err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const reporter =
    typeof window !== "undefined" ? window.__aimReportFileError : undefined;
  if (typeof reporter === "function") {
    reporter(op, message);
    return;
  }
  console.error(`File ${op} failed:`, err);
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(`Could not ${op} the file:\n${message}`);
  }
}

declare global {
  interface Window {
    /**
     * Dirty/autosave guard (sibling C). Resolves `false` to abort a discard,
     * `true` to proceed. Shows the "unsaved changes" modal when dirty;
     * resolves `true` immediately when the document is already clean.
     */
    __aimConfirmDiscard?: () => boolean | Promise<boolean>;
    /** Errors (sibling C): show a friendly file-error dialog. */
    __aimReportFileError?: (op: "open" | "save", message: string) => void;
  }
}
