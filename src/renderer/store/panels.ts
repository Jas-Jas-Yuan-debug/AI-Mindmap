// Which transient overlay panel is open (cheat sheet / settings / about).
// At most one at a time. Search has its own store (it's a persistent bar with
// query state, not a one-shot modal).

import { create } from "zustand";

export type PanelId = "cheatsheet" | "settings" | "about" | null;

export interface PanelsState {
  open: PanelId;
  show(id: Exclude<PanelId, null>): void;
  close(): void;
  toggle(id: Exclude<PanelId, null>): void;
}

export const usePanels = create<PanelsState>((set, get) => ({
  open: null,
  show: (id) => set({ open: id }),
  close: () => set({ open: null }),
  toggle: (id) => set({ open: get().open === id ? null : id }),
}));
