// Hook: install Stage click handlers that drive edge selection.
//
// Phase 3 PR 3 (sibling subagent C). Sibling A's Edge.tsx renders each edge
// as a Konva Group with `name="aim-edge"` and the edge's id stamped on the
// Konva node via `id={edge.id}`. We hit-test the click target up the Konva
// ancestor chain (matching the `text-node` pattern in TextNode.tsx) and
// dispatch to `useEdgeSelection` when an edge is clicked.
//
// Why a Stage click handler (not per-edge onClick):
//   - sibling A's `<Edge>` is shared with the (later) drag-to-connect logic
//     and shouldn't carry React-side click props.
//   - Konva click events bubble through `<Group>` ancestors all the way up to
//     the Stage, so a single stage-level listener catches every edge click
//     and is trivial to extend in Phase 4 for multi-select / Shift+click.
//
// Behavior:
//   - Click on an `aim-edge` Konva node (or any descendant of one):
//     select that edge, clear node selection so the focus ring doesn't
//     persist on a node while the edge is "selected".
//   - Click on anything else (including the Stage itself or a text-node):
//     clear the edge selection. Node selection is handled separately by
//     `Canvas.tsx`'s mousedown handler — we intentionally don't touch
//     `useSelection` here except to *clear* it when an edge is picked.
//
// We listen for `click` (not `mousedown`) so a pan-drag started on an edge
// doesn't accidentally select it. Konva's click event only fires when
// mousedown + mouseup happen on the same node without significant motion.

import { useCallback } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import { useEdgeSelection } from "../../store/edgeSelection.js";
import { useSelection } from "../../store/selection.js";

/** Walk up from `node` looking for an ancestor (or self) with the given name.
 *  Returns the first match or null. Mirrors the standard Konva hit-test
 *  idiom used by `text-node` click handling. */
function findAncestorWithName(
  node: Konva.Node | null | undefined,
  name: string,
): Konva.Node | null {
  let cursor: Konva.Node | null = node ?? null;
  while (cursor) {
    if (cursor.name() === name) return cursor;
    // `getParent()` returns `null` at the Stage root, ending the loop.
    cursor = cursor.getParent() ?? null;
  }
  return null;
}

export interface EdgeSelectClickHandler {
  /** Wire to <Stage onClick={...}> and <Stage onTap={...}> (touch). */
  onClick(e: KonvaEventObject<MouseEvent | TouchEvent>): void;
}

export function useEdgeSelectClick(): EdgeSelectClickHandler {
  const onClick = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const edgeNode = findAncestorWithName(e.target, "aim-edge");
      if (edgeNode) {
        const id = edgeNode.id();
        if (id) {
          useEdgeSelection.getState().select(id);
          // An edge is now the focus target — drop any leftover node
          // selection so the user sees one selection at a time. Phase 4
          // unifies the two stores; this manual cross-clear is the
          // Phase 3 workaround.
          useSelection.getState().clear();
          return;
        }
      }
      // Click missed an edge: clear edge selection. We don't touch
      // `useSelection` (nodes) here — Canvas.tsx already handles the
      // node-selection-clear for empty-canvas clicks.
      useEdgeSelection.getState().clear();
    },
    [],
  );

  return { onClick };
}
