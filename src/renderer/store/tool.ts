// Active canvas tool (Phase: UX toolbar). "select" is the default and means
// "no special mode" — the canvas behaves exactly as it always has. The other
// tools arm a one-shot placement / action; the canvas reads `activeTool` to
// decide what an empty-canvas click does.

import { create } from "zustand";

// "marquee" arms an explicit rubber-band rectangular selection ("框选"). It
// reuses the same lasso drag that the plain select tool offers on empty
// canvas, but as a first-class tool so the toolbar's dotted-square reads as
// "box-select" (which is what users expect) instead of secretly creating a
// group. Group CREATION lives on its own "group" tool with a distinct icon.
// V2 (drawing app) widened this union. Tools fall into a few families:
//   - navigation:  select, hand (pan), marquee (box-select)
//   - cards/embeds: text, image, link, group, edge
//   - shapes:      rectangle, diamond, ellipse   → create a ShapeNode
//   - linear:      line, arrow                   → create a LinearNode
//   - freehand:    draw                          → create a DrawNode
//   - eraser:      delete nodes under the pointer
// "lock" is NOT here — it's a separate toggle (see store/lock.ts), not a tool
// mode, because it gates interaction rather than arming a placement.
export type Tool =
  | "select"
  | "marquee"
  | "hand"
  | "text"
  | "group"
  | "edge"
  | "image"
  | "link"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "line"
  | "arrow"
  | "draw"
  | "eraser";

export interface ToolState {
  activeTool: Tool;
  setTool(t: Tool): void;
}

export const useTool = create<ToolState>((set) => ({
  activeTool: "select",
  setTool: (t) => set({ activeTool: t }),
}));
