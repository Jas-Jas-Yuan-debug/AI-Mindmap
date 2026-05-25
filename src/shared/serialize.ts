// Serialize / deserialize between the renderer's in-memory store shape
// (nodes + edges + viewport) and the on-disk `AimapFile` document.
//
// Pure functions, no store / IPC / fs access — unit-testable in isolation.
// Phase 5 (PR 1/3). The file-menu wiring (sibling B) and autosave (sibling C)
// call `toAimapFile` before save and `fromAimapFile` after load.

import {
  AIMAP_FORMAT_VERSION,
  type AimapFile,
  type AimapViewport,
  type ChatThread,
  type Edge,
  type Node,
} from "./aimap.js";

/** The app's own version string, written into `meta.appVersion` on save. */
export const APP_VERSION = "0.1.0";

/** Inputs needed to build a fresh `AimapFile` from the live stores. */
export interface ToAimapArgs {
  nodes: Node[];
  edges: Edge[];
  viewport: AimapViewport;
  chats?: ChatThread[];
  /** App semver to stamp into meta.appVersion. Defaults to APP_VERSION. */
  appVersion?: string;
  /**
   * Original document creation time (ISO 8601). Pass the existing
   * `meta.createdAt` when re-saving a loaded document so it is preserved.
   * Omit for a brand-new document — `now` is used for both timestamps.
   */
  createdAt?: string;
  /**
   * Test seam: the timestamp used for `updatedAt` (and `createdAt` when not
   * supplied). Defaults to `new Date().toISOString()`.
   */
  now?: string;
}

/**
 * Build a valid `AimapFile` from the parts the stores hold. Stamps a fresh
 * `updatedAt`; preserves `createdAt` when provided, otherwise sets it to the
 * same `now`. Z-order is preserved (array order is significant — see plan §5).
 *
 * The returned document is NOT validated here; callers that write to disk
 * should run it through `parseAimapFile` first (the IPC save handler does).
 */
export function toAimapFile(args: ToAimapArgs): AimapFile {
  const now = args.now ?? new Date().toISOString();
  const createdAt = args.createdAt ?? now;
  const doc: AimapFile = {
    formatVersion: AIMAP_FORMAT_VERSION,
    meta: {
      app: "AI-Mindmap",
      appVersion: args.appVersion ?? APP_VERSION,
      createdAt,
      updatedAt: now,
    },
    viewport: {
      x: args.viewport.x,
      y: args.viewport.y,
      zoom: args.viewport.zoom,
    },
    nodes: args.nodes,
    edges: args.edges,
  };
  if (args.chats !== undefined) doc.chats = args.chats;
  return doc;
}

/** The slices the renderer stores need, extracted from a loaded document. */
export interface FromAimapResult {
  nodes: Node[];
  edges: Edge[];
  viewport: AimapViewport;
  chats: ChatThread[];
}

/**
 * Extract the store-relevant parts of a loaded `AimapFile`. The inverse of
 * `toAimapFile` for nodes / edges / viewport (timestamps + meta are dropped,
 * they are regenerated on the next save).
 */
export function fromAimapFile(doc: AimapFile): FromAimapResult {
  return {
    nodes: doc.nodes,
    edges: doc.edges,
    viewport: doc.viewport,
    chats: doc.chats ?? [],
  };
}
