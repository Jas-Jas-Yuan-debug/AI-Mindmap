// Zustand nodes slice — the in-memory model for every node on the canvas.
//
// This is the foundational store of Phase 2. Phase 3 added an `edges` slice
// alongside it, Phase 4 wrapped mutations in history, and Phase 5 (PR 1/3)
// landed the canonical `src/shared/aimap.ts` schema (renamed from
// jsoncanvas.ts) + Zod validators.
//
// Type locality (post-Phase-5): the CANONICAL node types now live in
// `src/shared/aimap.ts`. This store re-exports them so the ~40 existing
// import sites keep working unchanged. We keep the Zustand store, the
// actions, and `makeNodeId` here (runtime concerns); the file format types
// are imported from the shared module (single source of truth).
//
// `AimapNode` deliberately stays `= TextNode`: the canvas only RENDERS text
// nodes until Phase 6 (group) / Phase 7 (file, link, image). The FILE schema
// in aimap.ts defines all variants for forward-compat, but the runtime store
// is intentionally narrowed to what the renderer can draw today. Widening
// `AimapNode` to the full `Node` union is a Phase 6/7 change, gated on the
// renderer learning to draw those variants.
//
// Public API used by sibling subagents:
//   - `useNodes` — the Zustand hook. Move/resize/delete/create + edit/color
//     all flow through these actions.
//   - `makeNodeId()` — mint a new id when creating a node. Delegates to the
//     canonical `makeId` helper in `src/shared/aimap.ts`.

import { create } from "zustand";
import { makeId } from "../../shared/aimap.js";

// Canonical file-format types, re-exported from the shared schema module so
// existing consumers can keep importing them from the store path.
export type {
  NodeType,
  HexColor,
  PresetColor,
  Color,
  NodeBase,
  TextNode,
  FileNode,
  LinkNode,
  ImageNode,
  GroupNode,
  Node as AimapFileNode,
} from "../../shared/aimap.js";

import type { TextNode } from "../../shared/aimap.js";

/**
 * The node shape the runtime store + renderer operate on. Narrowed to
 * `TextNode` because the canvas only draws text nodes today; the on-disk
 * `Node` union (see aimap.ts) is wider. Re-exported as `AimapFileNode` above
 * for code that needs the full union. Widen this in Phase 6/7.
 */
export type AimapNode = TextNode;

export interface NodesState {
  nodes: AimapNode[];
  /** Append a new node. Caller is responsible for id uniqueness. */
  addNode(n: AimapNode): void;
  /**
   * Shallow-merge `patch` into the node identified by `id`. No-op if the
   * id is unknown — the store never throws so we don't accidentally crash
   * the renderer on a stale reference (e.g. a redo after a delete).
   */
  updateNode(id: string, patch: Partial<AimapNode>): void;
  /** Remove the node with the given id. No-op if missing. */
  deleteNode(id: string): void;
  /** Convenience: update only `x`/`y`. Equivalent to `updateNode(id, {x,y})`. */
  moveNode(id: string, x: number, y: number): void;
  /**
   * Update size, optionally with a new origin (used when resizing from the
   * top-left handle, where width grows AND the node origin shifts).
   */
  resizeNode(id: string, width: number, height: number, x?: number, y?: number): void;
}

export const useNodes = create<NodesState>((set) => ({
  nodes: [],
  addNode: (n) => set((s) => ({ nodes: [...s.nodes, n] })),
  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? ({ ...n, ...patch } as AimapNode) : n,
      ),
    })),
  deleteNode: (id) =>
    set((s) => ({ nodes: s.nodes.filter((n) => n.id !== id) })),
  moveNode: (id, x, y) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    })),
  resizeNode: (id, width, height, x, y) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              width,
              height,
              ...(x !== undefined ? { x } : {}),
              ...(y !== undefined ? { y } : {}),
            }
          : n,
      ),
    })),
}));

/**
 * Mint a fresh node id. Delegates to the canonical `makeId` helper in
 * `src/shared/aimap.ts` (uuid-v4 when available, short-suffix fallback for
 * jsdom + older runtimes).
 */
export function makeNodeId(): string {
  return makeId("n");
}
