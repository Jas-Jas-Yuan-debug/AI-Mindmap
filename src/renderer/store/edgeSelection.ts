// Zustand edge-selection slice — tracks which edge (if any) is currently selected.
//
// Phase 3 PR 3 (sibling subagent C): edge selection is intentionally kept in
// a separate slice from the node selection (`./selection.ts`). The node slice
// is nodes-only by convention; mixing edge ids into its `ids` map would
// break every existing reader's mental model and force a `kind` discriminator
// onto a hot path. Phase 4 unifies multi-select (nodes + edges) via lasso,
// at which point we'll reconsider — but for Phase 3 single-select is enough.
//
// Storage: a single nullable id. Phase 3 is single-select; Phase 4 will
// expand to a `Record<string, true>` mirroring `selection.ts`.
//
// Public API (used by sibling subagents):
//   - `useEdgeSelection` — Zustand hook. Read `selectedEdgeId` from
//     `EdgeSelectionHighlight.tsx` to render the focus overlay.
//   - `useEdgeSelection.getState().select(id)` — what
//     `useEdgeSelectClick.ts` calls when the user clicks an `aim-edge`.
//   - `useEdgeSelection.getState().clear()` — called on empty-canvas
//     click and after delete.

import { create } from "zustand";

export interface EdgeSelectionState {
  /** The single currently-selected edge id, or null when nothing is selected. */
  selectedEdgeId: string | null;
  /** Select a single edge id (replaces any prior edge selection). */
  select(id: string): void;
  /** Drop the edge selection. */
  clear(): void;
  /** O(1) check used by render code. */
  isSelected(id: string): boolean;
}

export const useEdgeSelection = create<EdgeSelectionState>((set, get) => ({
  selectedEdgeId: null,
  select: (id) => set({ selectedEdgeId: id }),
  clear: () => set({ selectedEdgeId: null }),
  isSelected: (id) => get().selectedEdgeId === id,
}));
