// Zustand settings slice — small UI-toggle state separate from viewport math.
//
// Phase 1 PR 3 introduces a single user-facing toggle (grid visibility) so the
// View menu has something to flip. Keeping it in its own store (rather than
// piling it onto the viewport store) makes intent obvious: `viewport` is pure
// camera state, `settings` is "user preferences that affect rendering."
//
// Later phases will likely grow this slice with `showOrigin`, `theme`,
// `snapToGrid`, etc., and eventually persist it via the Platform settings
// adapter. For now everything is in-memory and resets on reload.

import { create } from "zustand";

export interface SettingsState {
  /** Whether the dotted background grid is drawn under the canvas content. */
  gridVisible: boolean;

  /** Flip `gridVisible`. */
  toggleGrid(): void;
  /** Set `gridVisible` explicitly. */
  setGridVisible(visible: boolean): void;
}

export const useSettings = create<SettingsState>((set) => ({
  gridVisible: true,
  toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),
  setGridVisible: (visible) => set({ gridVisible: visible }),
}));
