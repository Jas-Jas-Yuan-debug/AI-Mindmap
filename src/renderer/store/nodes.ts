// Zustand nodes slice — the in-memory model for every node on the canvas.
//
// This is the foundational store of Phase 2. Phase 3 adds an `edges` slice
// alongside it, Phase 4 wraps mutations in a history middleware, and Phase 5
// renames `src/shared/jsoncanvas.ts` to `src/shared/aimap.ts` and moves the
// canonical schema types over.
//
// Type locality: the canonical `AimapFile` / `TextNode` schema lives in
// `DEVELOPMENT_PLAN.md` §5. The file rename + shared module is Phase 5's
// scope, so to avoid dragging that work into Phase 2 we declare the types
// locally here. **Field names + shape MUST match plan §5 exactly** so the
// Phase 5 swap is a pure import-path change with no runtime fallout.
//
// Phase 2 only uses the `"text"` variant; the wider `NodeType` union is
// declared up-front so Phase 3 (group) / Phase 7 (file, link, image) can
// extend `AimapNode` without breaking existing call-sites or store
// consumers.
//
// Public API used by sibling subagents:
//   - `useNodes` — the Zustand hook. Sibling B (move/resize/delete/create)
//     drives every node mutation through these actions. Sibling C
//     (edit/markdown/color picker) updates `text` and `color` via
//     `updateNode(id, { text })` / `updateNode(id, { color })`.
//   - `makeNodeId()` — call this to mint a new id when creating a node.
//     Phase 5 will replace it with a uuid-v4 helper from `src/shared`.

import { create } from "zustand";

export type NodeType = "text" | "file" | "link" | "image" | "group";

// Hex strings are validated at file-load time (Phase 5); the type-level
// guard is intentionally loose so we don't pay for runtime regex checks on
// every render.
export type HexColor = `#${string}`;
// Plan §5 presets: "1"..."6" mapped to specific hues in TextNode.tsx.
export type PresetColor = "1" | "2" | "3" | "4" | "5" | "6";
export type Color = HexColor | PresetColor;

export interface NodeBase {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: Color;
  parentId?: string;
}

export interface TextNode extends NodeBase {
  type: "text";
  text: string;
}

/**
 * Union of every node variant the renderer knows how to draw. Phase 2 only
 * has `TextNode`; future phases extend the union (group / file / link /
 * image). Store actions are typed against this union so adding a variant
 * doesn't ripple changes through every caller.
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
 * Mint a fresh node id. Prefer `crypto.randomUUID` when available (modern
 * browsers + Node 19+), fall back to a short random suffix elsewhere so
 * jsdom + older runtimes still work.
 *
 * Phase 5 replaces this with the canonical uuid-v4 helper exported from
 * `src/shared/aimap.ts` once that file lands.
 */
export function makeNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n_${Math.random().toString(36).slice(2, 10)}`;
}
