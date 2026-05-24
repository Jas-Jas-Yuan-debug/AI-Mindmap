// Hook: install a contextmenu listener on the Stage container that opens
// the ColorPicker when the user right-clicks an edge.
//
// Phase 3 PR 3 (sibling subagent C). The node right-click path lives in
// `NodeOverlayLayer.tsx`'s window-level contextmenu listener; it hit-tests
// against DOM rects derived from the node positions. Edges don't have a
// DOM rect — they're pure Konva. So the cleanest path is to use Konva's
// own `Stage.getIntersection(point)` to figure out what's under the cursor.
//
// We attach the listener to the Stage's container element (the `<div>`
// React-Konva mounts the canvas inside). That way:
//   - `event.offsetX / offsetY` is relative to the stage container, exactly
//     what `Stage.getIntersection` expects.
//   - Stop-propagating + preventDefault keeps the browser menu suppressed
//     even when the cursor sits exactly on an edge pixel.
//
// Coordination with NodeOverlayLayer:
//   - NodeOverlayLayer's window-level contextmenu fires FIRST (window-level
//     listeners on `capture: true` fire before per-element listeners).
//   - If the cursor is over a node rect, NodeOverlayLayer claims the event
//     and opens the picker for that node.
//   - If not, the Stage container's contextmenu fires and we hit-test for
//     an edge. If we find one, open the picker for that edge.
//   - If neither claims it (right-click on empty canvas), the browser's
//     default menu would show — but NodeOverlayLayer's listener only
//     preventDefaults on a node hit, so for now we just let the browser
//     default through on misses. Phase 4 may add a "right-click on empty
//     canvas" menu; not required by Phase 3.

import { useEffect, type RefObject } from "react";
import type Konva from "konva";
import { useColorPicker } from "../../store/colorPicker.js";

/** Walk up looking for an ancestor (or self) named `name`. */
function findAncestorWithName(
  node: Konva.Node | null | undefined,
  name: string,
): Konva.Node | null {
  let cursor: Konva.Node | null = node ?? null;
  while (cursor) {
    if (cursor.name() === name) return cursor;
    cursor = cursor.getParent() ?? null;
  }
  return null;
}

export function useEdgeContextMenu(
  stageRef: RefObject<Konva.Stage | null>,
): void {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.container();
    if (!container) return;

    const onContextMenu = (e: MouseEvent) => {
      // `offsetX/Y` is already in container-local coords (matches the units
      // Stage.getIntersection expects).
      const point = { x: e.offsetX, y: e.offsetY };
      const hit = stage.getIntersection(point);
      if (!hit) return;
      const edgeNode = findAncestorWithName(hit, "aim-edge");
      if (!edgeNode) return;
      const id = edgeNode.id();
      if (!id) return;
      // Suppress the browser menu and claim the event. We use clientX/Y
      // (not offsetX/Y) for the picker's anchor because the ColorPicker
      // CSS positions absolutely against the viewport.
      e.preventDefault();
      e.stopPropagation();
      useColorPicker.getState().show({
        targetId: id,
        targetKind: "edge",
        x: e.clientX,
        y: e.clientY,
      });
    };

    container.addEventListener("contextmenu", onContextMenu);
    return () => container.removeEventListener("contextmenu", onContextMenu);
    // stageRef.current itself is stable for the lifetime of the Stage; we
    // only need to re-bind if the ref ever swaps, which it doesn't in
    // Canvas.tsx. Including stageRef in the deps satisfies the rule.
  }, [stageRef]);
}
