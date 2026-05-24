// Zustand viewport slice — single source of truth for pan offset + zoom.
//
// The whole canvas (Stage, future grid, future status bar, future
// ZoomControls) reads from this store. Phase 1 PR 1 only exposes the
// state + setters; interaction wiring (wheel, drag, keyboard shortcuts)
// arrives in PR 2.
//
// Constants ZOOM_MIN / ZOOM_MAX and the `clampZoom` helper live in
// ../canvas/layout.ts (the pure module) and are re-exported here for
// the convenience of consumers that already import from the store.

import { create } from "zustand";
import { clampZoom, ZOOM_MAX, ZOOM_MIN } from "../canvas/layout.js";

export { ZOOM_MAX, ZOOM_MIN };

export const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 } as const;

export interface ViewportState {
  /** Pan offset in screen pixels (Stage.x / Stage.y). */
  x: number;
  y: number;
  /** Scale factor; clamped to [ZOOM_MIN, ZOOM_MAX] on every write. */
  zoom: number;

  /** Replace the entire viewport. Zoom is clamped. */
  setViewport(v: { x: number; y: number; zoom: number }): void;
  /** Translate by a screen-pixel delta. */
  panBy(dx: number, dy: number): void;
  /** Set the zoom factor (clamped). Pan is left untouched. */
  setZoom(zoom: number): void;
  /** Reset to DEFAULT_VIEWPORT. */
  reset(): void;
}

export const useViewport = create<ViewportState>((set) => ({
  ...DEFAULT_VIEWPORT,
  setViewport: (v) => set({ x: v.x, y: v.y, zoom: clampZoom(v.zoom) }),
  panBy: (dx, dy) => set((s) => ({ x: s.x + dx, y: s.y + dy })),
  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  reset: () => set({ ...DEFAULT_VIEWPORT }),
}));
