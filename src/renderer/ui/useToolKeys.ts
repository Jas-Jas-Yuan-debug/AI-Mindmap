// Single-key tool shortcuts (V/T/G/E/I/L), matching the toolbar hints.
// Suppressed while typing and when a modifier is held (so they don't clash
// with ⌘-shortcuts or text entry).

import { useEffect } from "react";
import { selectTool } from "./toolActions.js";
import type { Tool } from "../store/tool.js";

const KEY_TO_TOOL: Record<string, Tool> = {
  v: "select",
  t: "text",
  g: "group",
  e: "edge",
  i: "image",
  l: "link",
};

function inEditable(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function useToolKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || inEditable()) return;
      const tool = KEY_TO_TOOL[e.key.toLowerCase()];
      if (tool) {
        e.preventDefault();
        selectTool(tool);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
