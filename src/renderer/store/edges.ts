// Zustand edges slice — connections between nodes.
//
// Phase 3 introduces this store alongside `nodes.ts` and `selection.ts`.
// We keep edge types LOCAL here (rather than reaching into the future
// `src/shared/aimap.ts` schema) to stay isolated from Phase 5's file-
// rename. Field names + shape match plan §5 exactly so the Phase 5 swap
// is a pure import-path change.
//
// Public API used by sibling subagents (Phase 3 PRs 2 + 3):
//   - `useEdges` — the Zustand hook.
//       * Sibling B (drag-to-connect) calls `useEdges.getState().addEdge(...)`
//         once a drag commits between two anchor dots.
//       * Sibling B (label editor) calls `updateEdge(id, { label })`.
//       * Sibling C (selection + delete + color picker) calls
//         `updateEdge(id, { color })`, `deleteEdge(id)`, and reads the
//         `edges` array for hit-testing / rendering.
//   - `makeEdgeId()` — mint a unique id when creating an edge. Uses
//     `crypto.randomUUID` when available with a short-suffix fallback for
//     jsdom + older runtimes (same pattern as `makeNodeId`).
//   - `deleteNodeAndEdges(nodeId)` — atomic cascade helper. Removes the
//     node AND every connected edge in one logical operation. Used by
//     `useDeleteKey`; Phase 4's history middleware will wrap both writes
//     in a single undo entry by treating this helper as the transaction
//     boundary.
//
// Why a separate slice from `nodes`:
//   1. Edge mutations are independent of node mutations — a Phase 4
//      history middleware can record them as their own action types.
//   2. Per-edge selection state belongs in `selection.ts` (sibling C
//      extends the selection store to track edge ids), not here.
//   3. Renderer subscribes to `edges` only when it needs to redraw the
//      edge layer; node-only changes don't invalidate edge subscribers.

import { create } from "zustand";
import { makeId } from "../../shared/aimap.js";
import { useNodes } from "./nodes.js";

// Canonical edge types now live in `src/shared/aimap.ts` (Phase 5, PR 1/3).
// Re-exported here so existing consumers keep importing `Edge` / `EdgeSide` /
// `EdgeEnd` from the store path. Plan §5 edge-end defaults still apply:
// `fromEnd` defaults to "none", `toEnd` defaults to "arrow", so an edge with
// neither field set renders as a one-way arrow.
export type { Edge, EdgeSide, EdgeEnd } from "../../shared/aimap.js";

import type { Edge } from "../../shared/aimap.js";

export interface EdgesState {
  edges: Edge[];
  /** Append an edge. Caller is responsible for id uniqueness (use `makeEdgeId`). */
  addEdge(e: Edge): void;
  /**
   * Shallow-merge `patch` into the edge identified by `id`. No-op if the
   * id is unknown — mirrors the `useNodes.updateNode` "never throw" rule
   * so a stale reference (e.g. a redo after a delete) doesn't crash the
   * renderer.
   */
  updateEdge(id: string, patch: Partial<Edge>): void;
  /** Remove the edge with the given id. No-op if missing. */
  deleteEdge(id: string): void;
  /**
   * Cascade helper: remove every edge whose `fromNode` or `toNode`
   * matches `nodeId`. Returns the removed edges so a future history
   * middleware can record them for undo.
   */
  deleteEdgesForNode(nodeId: string): Edge[];
}

export const useEdges = create<EdgesState>((set, get) => ({
  edges: [],
  addEdge: (e) => set((s) => ({ edges: [...s.edges, e] })),
  updateEdge: (id, patch) =>
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? ({ ...e, ...patch } as Edge) : e)),
    })),
  deleteEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  deleteEdgesForNode: (nodeId) => {
    const before = get().edges;
    const removed = before.filter(
      (e) => e.fromNode === nodeId || e.toNode === nodeId,
    );
    set({
      edges: before.filter(
        (e) => e.fromNode !== nodeId && e.toNode !== nodeId,
      ),
    });
    return removed;
  },
}));

/**
 * Mint a fresh edge id. Delegates to the canonical `makeId` helper in
 * `src/shared/aimap.ts` (uuid-v4 when available, short-suffix fallback for
 * jsdom + older runtimes).
 */
export function makeEdgeId(): string {
  return makeId("e");
}

/**
 * Atomic cascade: remove a node AND every edge connected to it in one
 * helper call. Used by `useDeleteKey`. Phase 4's history middleware will
 * wrap the two store writes in a single undo entry by treating this
 * helper as the transaction boundary, so the user gets one Cmd+Z to
 * restore both the node and its edges.
 *
 * Returns the removed edges (the node deletion itself can be reconstructed
 * from the node id + the prior store state) so the future history layer
 * has the data it needs to record an inverse.
 */
export function deleteNodeAndEdges(nodeId: string): { removedEdges: Edge[] } {
  const removedEdges = useEdges.getState().deleteEdgesForNode(nodeId);
  useNodes.getState().deleteNode(nodeId);
  return { removedEdges };
}
