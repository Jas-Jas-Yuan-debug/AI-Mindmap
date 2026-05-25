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
// `AimapNode` is the union the runtime store + renderer operate on. Phase 6
// (this PR) WIDENED it from `TextNode` to `TextNode | GroupNode` now that the
// canvas can draw group containers (see `canvas/nodes/GroupNode.tsx`). File /
// link / image variants stay out of the runtime union until Phase 7 teaches
// the renderer to draw them. The FILE schema in aimap.ts always defines all
// variants for forward-compat; the runtime union is narrowed to what the
// renderer can draw today.
//
// CONSEQUENCE for consumers: code that reaches for `TextNode`-only fields
// (e.g. `.text`) MUST narrow with `node.type === "text"` first. The markdown
// overlay (`ui/NodeOverlay*.tsx`) and the `TextNodeCard` renderer are guarded
// this way; `GroupNode` is drawn by `GroupNodeBox`.
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

import type { GroupNode, TextNode } from "../../shared/aimap.js";

/**
 * The node shape the runtime store + renderer operate on. Phase 6 widened
 * this to `TextNode | GroupNode` (the canvas now draws both). File / link /
 * image variants from the on-disk `Node` union (see aimap.ts) join when the
 * renderer learns to draw them in Phase 7. Re-exported as `AimapFileNode`
 * above for code that needs the full union.
 */
export type AimapNode = TextNode | GroupNode;

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

/**
 * Mint a fresh group-node id. Same id space as nodes (groups ARE nodes), but
 * the `"g"` prefix makes group ids legible in dev tooling and serialized
 * files. Delegates to the canonical `makeId` helper.
 */
export function makeGroupId(): string {
  return makeId("g");
}
