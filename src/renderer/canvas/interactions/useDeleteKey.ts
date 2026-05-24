// Hook: register Delete / Backspace keydown to remove selected nodes / edges.
//
// Mounted once by <Canvas>. We listen at the document level (not on the
// Stage container) for the same reason usePan tracks the spacebar there —
// keyboard events don't bubble to Konva nodes, so the document is the
// canonical place to catch global shortcuts.
//
// Phase 2 (sibling B): handled node deletion via `useNodes.deleteNode`.
// Phase 3 PR 1 (sibling A): switched the node path to the top-level
//   `deleteNodeAndEdges` helper exported from `store/edges.ts`, so
//   cascade-deleting incident edges happens in one logical step (plan §6
//   Phase 3 exit criterion: "deleting a card also deletes its connected
//   edges"). Phase 4's history middleware will wrap the helper's two
//   store writes in a single undo entry by treating the helper as the
//   transaction boundary.
// Phase 3 PR 3 (this PR, sibling C): also delete the currently-selected
//   edge when the user presses Delete with no node selected. The two
//   selection sources are treated as independent so a future Phase 4
//   multi-select can hit both paths in one Delete press.
//
// Editing guard: when focus lives inside a form input, textarea, or
// contentEditable element, we let the browser handle Backspace/Delete
// normally — the user must be able to backspace inside the edit-mode
// textarea or the (Phase 3 PR 2) edge-label input without nuking the
// thing they're editing.

import { useEffect } from "react";
import { deleteNodeAndEdges, useEdges } from "../../store/edges.js";
import { useEdgeSelection } from "../../store/edgeSelection.js";
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

      const selectedNodeIds = Object.keys(useSelection.getState().ids);
      const selectedEdgeId = useEdgeSelection.getState().selectedEdgeId;

      if (selectedNodeIds.length === 0 && !selectedEdgeId) return;

      // 1. Nodes first — `deleteNodeAndEdges` cascade-removes incident
      //    edges in the same logical step. The helper is a top-level
      //    export from store/edges.ts (not a method on useEdges) — it
      //    orchestrates the two store writes atomically. Phase 4's
      //    history layer will record both writes under one undo entry.
      for (const id of selectedNodeIds) deleteNodeAndEdges(id);
      if (selectedNodeIds.length > 0) {
        useSelection.getState().clear();
      }

      // 2. Discrete edge selection — only run if an edge is selected.
      //    `deleteEdge` is a no-op on a missing id, so this is safe even
      //    if step 1's cascade already removed it as an incident edge
      //    (e.g. the user had both a node and one of its edges selected).
      if (selectedEdgeId) {
        useEdges.getState().deleteEdge(selectedEdgeId);
        useEdgeSelection.getState().clear();
      }

      // Prevent the browser's default (Backspace = back-navigation in some
      // configs; Delete is harmless but we suppress consistently).
      e.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
