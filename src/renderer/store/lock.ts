// Canvas lock toggle (V2). When the canvas is "locked" the content is
// view-only: nodes can't be selected, dragged, resized, drawn, or erased —
// only pan + zoom stay live. It's a deliberate, separate concern from the
// active TOOL (see store/tool.ts): a tool arms a placement gesture, whereas
// the lock GATES all node interaction regardless of which tool is selected.
// The toolbar's padlock button drives this; Canvas.tsx reads `locked` to
// disable the Nodes layer's hit-testing and to short-circuit its pointer
// handlers down to pan-only.

import { create } from "zustand";

export interface LockState {
  /** True when the canvas content is locked (view + pan only). */
  locked: boolean;
  /** Set the locked flag explicitly. */
  setLocked(v: boolean): void;
  /** Flip the locked flag. Wired to the toolbar padlock button. */
  toggle(): void;
}

export const useLock = create<LockState>((set) => ({
  locked: false,
  setLocked: (v) => set({ locked: v }),
  toggle: () => set((s) => ({ locked: !s.locked })),
}));
