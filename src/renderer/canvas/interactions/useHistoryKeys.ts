// Hook: register document-level keyboard shortcuts for undo / redo.
//
// Phase 4 PR 1 (sibling subagent A). Mounted once by <Canvas>.
//
// Bindings (mirrors usePan / useDeleteKey — keyboard events don't bubble to
// Konva nodes, so the document is the canonical place to catch globals):
//   - Cmd/Ctrl + Z              → undo
//   - Cmd/Ctrl + Shift + Z      → redo (mac convention)
//   - Cmd/Ctrl + Y              → redo (Windows convention)
//
// Typing guard: when focus is inside an <input>, <textarea>, <select>, or a
// contentEditable element, we let the browser handle the keystroke so the
// user's native text-editor undo (inside the card edit-mode textarea or an
// edge-label input) isn't hijacked by canvas undo. Same isTypingTarget shape
// as useDeleteKey.

import { useEffect } from "react";
import { useHistory } from "../../store/history.js";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useHistoryKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          useHistory.getState().redo();
        } else {
          useHistory.getState().undo();
        }
        return;
      }

      // Windows redo convention. No shift modifier expected.
      if (key === "y" && !e.shiftKey) {
        e.preventDefault();
        useHistory.getState().redo();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
