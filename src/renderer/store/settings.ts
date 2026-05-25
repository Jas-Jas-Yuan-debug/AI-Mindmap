// Zustand settings slice — user preferences that affect rendering + behaviour.
//
// Phase 1 introduced `gridVisible`. Phase 8 (this change) grows it into the
// real preferences store and PERSISTS it to localStorage via zustand's
// `persist` middleware, so settings survive a reload/restart (plan §6 Phase 8
// exit criterion "Settings persist"). Consumers keep the same API
// (`gridVisible`, `toggleGrid`, `setGridVisible`); new fields are additive.
//
// Telemetry: NONE. This store is local-only; nothing is sent anywhere.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PresetColor } from "../../shared/aimap.js";

export type ThemeMode = "light" | "dark" | "system";

export interface SettingsState {
  /** Whether the dotted background grid is drawn under the canvas content. */
  gridVisible: boolean;
  /** Color theme. "system" follows the OS `prefers-color-scheme`. */
  theme: ThemeMode;
  /** Autosave debounce in milliseconds (Phase 5 autosave reads this). */
  autosaveIntervalMs: number;
  /** Default preset color applied to newly created text cards (undefined = none). */
  defaultColor: PresetColor | undefined;

  toggleGrid(): void;
  setGridVisible(visible: boolean): void;
  setTheme(theme: ThemeMode): void;
  setAutosaveIntervalMs(ms: number): void;
  setDefaultColor(c: PresetColor | undefined): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      gridVisible: true,
      theme: "system",
      autosaveIntervalMs: 1000,
      defaultColor: undefined,

      toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),
      setGridVisible: (visible) => set({ gridVisible: visible }),
      setTheme: (theme) => set({ theme }),
      setAutosaveIntervalMs: (ms) =>
        set({ autosaveIntervalMs: Math.max(250, Math.min(60000, Math.round(ms))) }),
      setDefaultColor: (c) => set({ defaultColor: c }),
    }),
    {
      name: "aim.settings",
      // Persist only data fields, not the action functions.
      partialize: (s) => ({
        gridVisible: s.gridVisible,
        theme: s.theme,
        autosaveIntervalMs: s.autosaveIntervalMs,
        defaultColor: s.defaultColor,
      }),
    },
  ),
);
