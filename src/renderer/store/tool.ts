// Active canvas tool (Phase: UX toolbar). "select" is the default and means
// "no special mode" — the canvas behaves exactly as it always has. The other
// tools arm a one-shot placement / action; the canvas reads `activeTool` to
// decide what an empty-canvas click does.

import { create } from "zustand";

export type Tool = "select" | "text" | "group" | "edge" | "image" | "link";

export interface ToolState {
  activeTool: Tool;
  setTool(t: Tool): void;
}

export const useTool = create<ToolState>((set) => ({
  activeTool: "select",
  setTool: (t) => set({ activeTool: t }),
}));
