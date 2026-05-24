// Zustand slice for the floating ColorPicker's open/close state.
//
// Phase 3 PR 3 (sibling subagent C). Previously the picker's state lived
// as React-local state inside `NodeOverlayLayer.tsx` (a single component
// owned both the node hit-test and the picker). With Phase 3, the edge
// right-click path lives in a Konva Stage hook (`useEdgeContextMenu.ts`) —
// the picker's open trigger now spans two separate React subtrees.
//
// A tiny Zustand slice is the simplest way to bridge them: the edge hook
// calls `open(...)` and the NodeOverlayLayer reads the state to render the
// `<ColorPicker>` element. Both paths share the same close handler.
//
// Why not a React Context: the edge hook runs inside `<Canvas>` (above the
// NodeOverlayLayer in `App.tsx`). Threading a Context from a shared ancestor
// would require lifting state to App.tsx and prop-drilling, which is messier
// than a single global slice for this transient UI concern.

import { create } from "zustand";
import type { ColorTargetKind } from "../ui/ColorPicker.js";

export interface ColorPickerOpenState {
  targetId: string;
  targetKind: ColorTargetKind;
  /** Screen-space x where the picker should anchor (clientX of the event). */
  x: number;
  /** Screen-space y where the picker should anchor (clientY of the event). */
  y: number;
}

export interface ColorPickerState {
  /** Null when the picker is closed. */
  open: ColorPickerOpenState | null;
  show(target: ColorPickerOpenState): void;
  close(): void;
}

export const useColorPicker = create<ColorPickerState>((set) => ({
  open: null,
  show: (target) => set({ open: target }),
  close: () => set({ open: null }),
}));
