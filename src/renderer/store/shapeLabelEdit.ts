// Tiny Zustand store for shape-label in-place editing (V2).
//
// Kept intentionally separate from the text-card `pendingEditId` in
// NodeOverlayLayer so the two editors can never accidentally collide: only one
// editor can be open at a time per store, and the two stores are independent.
//
// Usage:
//   ShapeNode.tsx   → calls useShapeLabelEdit.getState().begin(id) on dblclick
//   ShapeLabelOverlayLayer.tsx → reads editingId, renders textarea, calls end()

import { create } from "zustand";

export interface ShapeLabelEditState {
  /** The id of the shape node currently being label-edited, or null. */
  editingId: string | null;
  /** Enter label-edit mode for the given shape node. */
  begin(id: string): void;
  /** Exit label-edit mode (called by commit or cancel). */
  end(): void;
}

export const useShapeLabelEdit = create<ShapeLabelEditState>((set) => ({
  editingId: null,
  begin: (id) => set({ editingId: id }),
  end: () => set({ editingId: null }),
}));
