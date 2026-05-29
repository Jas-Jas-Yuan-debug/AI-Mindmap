// Hook: register document-level keyboard shortcuts for group / ungroup.
//
// Phase 6 (S4 — grouping). Mounted once by <App> (wired by orchestrator).
//
// Bindings:
//   - Cmd/Ctrl + G              → group selected nodes into a new GroupNode
//   - Cmd/Ctrl + Shift + G      → ungroup (dissolve) selected GroupNodes
//
// Typing guard: when focus is inside an <input>, <textarea>, <select>, or a
// contentEditable element, we let the browser handle the keystroke — same
// pattern as useHistoryKeys / useDeleteKey / useClipboardKeys.
//
// History pattern: capture() is called BEFORE the mutation so the pre-mutation
// document is on the undo stack, matching every other discrete action in the
// canvas. The mutation functions (groupSelection / ungroupSelection) do NOT
// capture history themselves — that is intentionally the caller's job.

import { useEffect } from "react";
import { groupSelection, ungroupSelection } from "../../store/reparent.js";
import { useSelection } from "../../store/selection.js";
import { useHistory } from "../../store/history.js";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useGroupKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isTypingTarget(e.target)) return;
      if (e.key.toLowerCase() !== "g") return;

      if (e.shiftKey) {
        // Cmd/Ctrl + Shift + G → ungroup
        e.preventDefault();
        const ids = Object.keys(useSelection.getState().ids);
        useHistory.getState().capture();
        const freed = ungroupSelection(ids);
        useSelection.getState().set(freed);
      } else {
        // Cmd/Ctrl + G → group
        e.preventDefault();
        const ids = Object.keys(useSelection.getState().ids);
        useHistory.getState().capture();
        const gid = groupSelection(ids);
        if (gid) useSelection.getState().set([gid]);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
