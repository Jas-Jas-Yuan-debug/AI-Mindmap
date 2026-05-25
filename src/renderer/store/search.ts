// Minimal open/close state for the search bar. Query + match navigation live
// as local state in SearchBar; this store only governs visibility so a global
// keybind (mod+F) and the bar can share it.

import { create } from "zustand";

export interface SearchState {
  open: boolean;
  show(): void;
  close(): void;
  toggle(): void;
}

export const useSearch = create<SearchState>((set, get) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
  toggle: () => set({ open: !get().open }),
}));
