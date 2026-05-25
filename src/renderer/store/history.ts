// Zustand history slice — snapshot-based undo/redo for the canvas document.
//
// Phase 4 PR 1 (sibling subagent A). This is the undo/redo FOUNDATION the
// rest of Phase 4 builds on:
//   - Sibling B (multi-select + group move) wraps a group-move drag in
//     `useHistory.getState().transact(fn)` so moving 50 nodes is ONE undo
//     step, not 50.
//   - Sibling C (clipboard cut/copy/paste) wraps a paste (which mutates both
//     the nodes and edges stores) in `transact(fn)` so a paste is one step.
//
// Design: SNAPSHOT history, not action/inverse logs. Before every discrete
// mutation we push a full copy-by-reference snapshot of the {nodes, edges}
// arrays into `past`. Undo swaps the live stores back to a prior snapshot
// (pushing the current state onto `future`); redo is the mirror. This is the
// simplest correct model for a document this size (≤ a few thousand nodes)
// and sidesteps the bug-prone task of writing an inverse for every action
// type — which §6 Phase 4's "undo/redo is correct after EVERY action type"
// exit criterion would otherwise demand we get exactly right for each one.
//
// **Snapshot aliasing invariant (load-bearing — do not break):**
//   A snapshot stores the SAME array instances the stores currently hold
//   (`useNodes.getState().nodes`, `useEdges.getState().edges`). This is safe
//   ONLY because both stores are strictly immutable: every mutation
//   (`addNode`, `updateNode`, `moveNode`, `deleteNode`, `addEdge`, …) creates
//   a NEW array via spread/map/filter and never mutates the existing array or
//   its element objects in place. So a captured snapshot's arrays are
//   effectively frozen copies-by-reference — later mutations allocate fresh
//   arrays and leave the snapshot's arrays untouched. If any future code
//   mutates `nodes`/`edges` (or an element) in place, this store will corrupt
//   history. Keep the stores immutable.
//
// Cap: `past` and `future` are each capped at CAP entries (oldest dropped).
// Closes §6 Phase 4 "Memory: undo stack capped, no leaks".

import { create } from "zustand";
import { useNodes, type AimapNode } from "./nodes.js";
import { useEdges, type Edge } from "./edges.js";

/** A frozen-by-convention copy-by-reference of the whole document. */
interface Snapshot {
  nodes: AimapNode[];
  edges: Edge[];
}

/** Max entries kept in each of `past` / `future`. Plan §6: 200. */
const CAP = 200;

export interface HistoryState {
  /** Snapshots BEFORE each captured mutation, oldest first. */
  past: Snapshot[];
  /** Snapshots undone-away-from, available for redo. Cleared on new capture. */
  future: Snapshot[];
  /**
   * Snapshot the current doc into `past` and clear `future`. Call this
   * IMMEDIATELY BEFORE a mutation so the snapshot captures the pre-mutation
   * state. No-op while inside an open `transact` — only the outermost
   * capture for a transaction counts, so a multi-store operation collapses
   * to a single undo step.
   */
  capture(): void;
  /**
   * Run `fn` as a single undo step: capture once up-front, then run all the
   * mutations inside `fn` (any `capture()` calls they make are suppressed).
   * Nestable — only the outermost `transact` captures. Re-entrant-safe: the
   * depth counter is always decremented, even if `fn` throws.
   */
  transact(fn: () => void): void;
  /** Restore the most recent past snapshot; push current onto `future`. */
  undo(): void;
  /** Re-apply the most recent undone snapshot; push current onto `past`. */
  redo(): void;
  /** Drop all history (e.g. on opening a new document). */
  clear(): void;
}

/** Capture the live document as a copy-by-reference snapshot. */
function snapshot(): Snapshot {
  return {
    nodes: useNodes.getState().nodes,
    edges: useEdges.getState().edges,
  };
}

/** Swap the live stores to a snapshot's arrays. */
function restore(s: Snapshot): void {
  useNodes.setState({ nodes: s.nodes });
  useEdges.setState({ edges: s.edges });
}

export const useHistory = create<HistoryState>((set, get) => {
  // Transaction nesting depth. Lives in closure (not store state) because it's
  // transient control flow, not something the UI ever subscribes to.
  let txnDepth = 0;

  return {
    past: [],
    future: [],

    capture: () => {
      if (txnDepth > 0) return; // inside a transaction; outermost already captured
      set((s) => ({
        past: [...s.past, snapshot()].slice(-CAP),
        future: [],
      }));
    },

    transact: (fn) => {
      if (txnDepth === 0) get().capture();
      txnDepth++;
      try {
        fn();
      } finally {
        txnDepth--;
      }
    },

    undo: () => {
      const { past } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1]!;
      const curr = snapshot();
      set((s) => ({
        past: s.past.slice(0, -1),
        future: [...s.future, curr].slice(-CAP),
      }));
      restore(prev);
    },

    redo: () => {
      const { future } = get();
      if (future.length === 0) return;
      const next = future[future.length - 1]!;
      const curr = snapshot();
      set((s) => ({
        future: s.future.slice(0, -1),
        past: [...s.past, curr].slice(-CAP),
      }));
      restore(next);
    },

    clear: () => set({ past: [], future: [] }),
  };
});
