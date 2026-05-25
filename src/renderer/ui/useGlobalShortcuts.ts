// Phase 8 global keybinds that aren't tied to the canvas Stage:
//   ?        → open the keyboard cheat sheet
//   mod+F    → toggle search
// Suppressed while typing in a field so they don't hijack text entry.

import { useEffect } from "react";
import { usePanels } from "../store/panels.js";
import { useSearch } from "../store/search.js";

function inEditable(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inEditable()) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        useSearch.getState().toggle();
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        usePanels.getState().toggle("cheatsheet");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
