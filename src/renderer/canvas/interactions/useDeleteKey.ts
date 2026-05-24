// Hook: register Delete / Backspace keydown to remove all selected nodes.
//
// Mounted once by <Canvas>. We listen at the document level (not on the
// Stage container) for the same reason usePan tracks the spacebar there —
// keyboard events don't bubble to Konva nodes, so the document is the
// canonical place to catch global shortcuts.
//
// Editing guard: when focus lives inside a form input, textarea, or
// contentEditable element, we let the browser handle Backspace/Delete
// normally. This is what sibling C's edit-mode <textarea> overlay needs —
// the user must be able to backspace inside the textarea without nuking
// the card whose contents they're editing.

import { useEffect } from "react";
import { useSelection } from "../../store/selection.js";
import { deleteNodeAndEdges } from "../../store/edges.js";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useDeleteKey(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isTypingTarget(e.target)) return;

      const selectedIds = Object.keys(useSelection.getState().ids);
      if (selectedIds.length === 0) return;

      // Phase 3: route every node delete through `deleteNodeAndEdges`
      // so connected edges are removed in the same logical step. The
      // helper takes ONE node id at a time; we loop, but Phase 4's
      // history middleware will wrap the whole loop in a single undo
      // transaction.
      for (const id of selectedIds) deleteNodeAndEdges(id);
      useSelection.getState().clear();

      // Prevent the browser's default (Backspace = back-navigation in some
      // configs; Delete is harmless but we suppress consistently).
      e.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
