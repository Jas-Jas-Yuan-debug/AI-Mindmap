// Single-key tool shortcuts — full V2 set.
//
// Cluster mapping (mirrors Toolbar.tsx visual order):
//   Navigation : V=select  H=hand  M=marquee
//   Shapes     : R=rectangle  D=diamond  O=ellipse
//   Lines/Marks: A=arrow  P=draw(pencil)  [line has no single-key — conflicts with L]
//   Content    : T=text  I=image  L=link  E=edge  G=group
//   Erase      : X=eraser
//
// Guards: suppressed when any modifier key is held (⌘/Ctrl/Alt) and when
// focus is inside an editable element (input, textarea, contenteditable).

import { useEffect } from "react";
import { selectTool } from "./toolActions.js";
import type { Tool } from "../store/tool.js";

const KEY_TO_TOOL: Record<string, Tool> = {
  // Navigation cluster
  v: "select",
  h: "hand",
  m: "marquee",
  // Shapes cluster
  r: "rectangle",
  d: "diamond",
  o: "ellipse",
  // Lines & marks cluster (line intentionally omitted — no spare unambiguous key)
  a: "arrow",
  p: "draw",
  // Content cluster
  t: "text",
  i: "image",
  l: "link",
  e: "edge",
  g: "group",
  // Eraser
  x: "eraser",
};

function inEditable(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable)
  );
}

export function useToolKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || inEditable()) return;
      const tool = KEY_TO_TOOL[e.key.toLowerCase()];
      if (tool !== undefined) {
        e.preventDefault();
        selectTool(tool);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
