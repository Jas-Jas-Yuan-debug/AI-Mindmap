// Hook: document-level Cmd/Ctrl + C / X / V for the in-app clipboard.
//
// Phase 4 (PR 3/3, sibling subagent C). Mounted once by <Canvas>. We listen
// at the document level — like usePan (spacebar) and useDeleteKey — because
// keyboard events don't bubble to Konva nodes, so the document is the
// canonical place to catch global shortcuts.
//
// Shortcuts:
//   - Cmd/Ctrl + C → copySelection()
//   - Cmd/Ctrl + X → cut: transact(copy then delete the selected subgraph).
//       Reuses the same delete path as useDeleteKey — `deleteNodeAndEdges`
//       per selected node (cascade-removes incident edges) + clear selection.
//   - Cmd/Ctrl + V → paste: transact(pasteClipboard(PASTE_OFFSET)).
//
// Undo grouping: cut and paste are each wrapped in `useHistory.transact(fn)`
// (sibling A's history foundation) so the whole operation is ONE undo step.
// Plain copy is not a mutation, so it is not transacted. This satisfies the
// plan §6 Phase 4 criterion that paste is correct under undo/redo.
//
// Paste offset: a fixed +20,+20 canvas-unit nudge (PASTE_OFFSET). Chosen over
// cursor-anchored placement for V1 simplicity and determinism — repeated
// pastes cascade down-right, matching common editor behaviour. No mousemove
// tracking needed, keeping this hook self-contained.
//
// Editing guard: when focus lives inside an input / textarea / select /
// contentEditable element, we do nothing and let the browser handle the
// native copy/paste so we never hijack text-field clipboard shortcuts.

import { useEffect } from "react";
import {
  PASTE_OFFSET,
  copySelection,
  pasteClipboard,
} from "../../clipboard/clipboard.js";
import { deleteNodeAndEdges } from "../../store/edges.js";
import { useSelection } from "../../store/selection.js";
import { useHistory } from "../../store/history.js";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useClipboardKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Only the platform command modifier (Cmd on macOS, Ctrl elsewhere).
      // Ignore when Alt/Shift could mean a different binding, except Shift is
      // irrelevant for C/X/V so we don't gate on it.
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "x" && key !== "v") return;

      // Don't hijack native clipboard inside text fields / editors.
      if (isTypingTarget(e.target)) return;

      if (key === "c") {
        copySelection();
        e.preventDefault();
        return;
      }

      if (key === "x") {
        // Cut = copy the selection, then delete it — as one undo step.
        useHistory.getState().transact(() => {
          copySelection();
          const selectedNodeIds = Object.keys(useSelection.getState().ids);
          for (const id of selectedNodeIds) deleteNodeAndEdges(id);
          if (selectedNodeIds.length > 0) {
            useSelection.getState().clear();
          }
        });
        e.preventDefault();
        return;
      }

      // key === "v" — paste as one undo step.
      useHistory.getState().transact(() => {
        pasteClipboard(PASTE_OFFSET);
      });
      e.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
