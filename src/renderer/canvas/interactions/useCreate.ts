// Hook: returns a Konva onDblClick handler for the Stage that creates a new
// TextNode at the cursor when the user double-clicks empty canvas.
//
// "Empty canvas" = the Konva target is the Stage itself. Double-clicks on a
// card Group (or any of its children, e.g. a resize handle) are ignored
// here — sibling C may bind double-click-on-card to enter edit mode.
//
// After creating the node we:
//   - select it (so the selection ring + resize handles render immediately)
//   - mark its id as "pending edit" via the selection slice. Sibling C's
//     edit-mode component reads `consumePendingEdit()` on mount/effect and
//     opens the textarea on the freshly-created card. The handshake is in
//     the selection slice so we don't need a brand-new store just for one
//     flag.
//
// Default new-card geometry: 240 × 80 (plan §5 minimal-valid-file example).
// The cursor anchors at the CENTER of the new card so the card visually
// "appears under" the click, instead of one corner being at the cursor and
// the rest extending off to the bottom-right.

import { useCallback } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { screenToCanvas } from "../layout.js";
import { makeNodeId, useNodes } from "../../store/nodes.js";
import { useSelection } from "../../store/selection.js";
import { useViewport } from "../../store/viewport.js";
import { useHistory } from "../../store/history.js";

export const NEW_CARD_WIDTH = 240;
export const NEW_CARD_HEIGHT = 80;

export interface CreateHandlers {
  onDblClick(e: KonvaEventObject<MouseEvent>): void;
}

export function useCreate(): CreateHandlers {
  const onDblClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    // Empty canvas only.
    if (e.target !== stage) return;

    // Pointer position is in screen (container) space.
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const v = useViewport.getState();
    const canvasCursor = screenToCanvas(pointer, v);

    const id = makeNodeId();
    const x = Math.round(canvasCursor.x - NEW_CARD_WIDTH / 2);
    const y = Math.round(canvasCursor.y - NEW_CARD_HEIGHT / 2);

    // Phase 4 PR 1: capture the pre-create doc so Cmd+Z removes the new card.
    useHistory.getState().capture();

    useNodes.getState().addNode({
      id,
      type: "text",
      x,
      y,
      width: NEW_CARD_WIDTH,
      height: NEW_CARD_HEIGHT,
      text: "",
    });

    const sel = useSelection.getState();
    sel.select(id);
    // Sibling C's edit-mode overlay will pick this up via consumePendingEdit().
    sel.setPendingEdit(id);
  }, []);

  return { onDblClick };
}
