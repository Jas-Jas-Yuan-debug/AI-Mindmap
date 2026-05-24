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
import { useNodes } from "../../store/nodes.js";
import { useSelection } from "../../store/selection.js";

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

      // Snapshot the actions once, outside the loop — calling getState()
      // inside the loop would re-read the store on every iteration.
      const { deleteNode } = useNodes.getState();
      for (const id of selectedIds) deleteNode(id);
      useSelection.getState().clear();

      // Prevent the browser's default (Backspace = back-navigation in some
      // configs; Delete is harmless but we suppress consistently).
      e.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
