// Hook: drag-from-anchor → create a new edge.
//
// Phase 3 PR 2 (drag-to-connect). Wires Stage-level mousedown / mousemove /
// mouseup so the user can draw an edge by grabbing one of the small anchor
// dots on a card and releasing on another card's anchor.
//
// Flow (a single gesture):
//   1. mousedown on a Konva node whose `name` starts with "aim-anchor-dot"
//      → start a draft in useEdgeDraft with { fromNode, fromSide, cursor }.
//      Returns true ("we claimed the gesture") so the Canvas wrapper can
//      short-circuit usePan.onMouseDown.
//   2. mousemove → update the cursor in canvas space, and hit-test every
//      other card's anchors. If the cursor is within EDGE_SNAP_THRESHOLD
//      canvas px of an anchor on a DIFFERENT card, fill `draft.snap` with
//      that anchor so EdgeDraft can render the magnet effect.
//   3. mouseup →
//      - If `draft.snap` is set, commit: `useEdges.getState().addEdge(...)`
//        with `toEnd: "arrow"` (default end-cap).
//      - Else, cancel silently. No edge is created.
//      Reset the draft either way.
//
// Hit-testing target anchors:
//   We don't use Konva's getIntersection (it's O(N) over every shape per
//   call). Instead, we enumerate `useNodes.getState().nodes` and compute
//   the 4 anchor positions via `anchorPosition()` from sibling A's
//   geometry.ts. That's 4 × N float comparisons per mousemove — comfortable
//   for the 100-card target.
//
// Self-loop prevention:
//   V1 rejects "drag from card X anchor to another anchor on card X". The
//   `fromNode !== toNode` check happens both during hit-testing (so we
//   don't render a misleading snap effect on the same card) and at commit.
//
// Stage event ownership:
//   This hook returns three handlers (`onMouseDown`, `onMouseMove`,
//   `onMouseUp`). Canvas.tsx composes them with usePan: call this hook's
//   onMouseDown FIRST; if it returns true (anchor grabbed), don't call
//   usePan.onMouseDown so the user doesn't start a pan at the same time.
//   For mousemove/mouseup we always call both; the pan hook no-ops when
//   no pan is in progress.

import { useCallback } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import { screenToCanvas } from "../layout.js";
import { useViewport } from "../../store/viewport.js";
import { useNodes } from "../../store/nodes.js";
import {
  EDGE_SNAP_THRESHOLD_CANVAS,
  useEdgeDraft,
  type DraftSnap,
} from "../../store/edgeDraft.js";
import { makeEdgeId, useEdges, type EdgeSide } from "../../store/edges.js";
import { useHistory } from "../../store/history.js";
import { anchorPosition } from "./geometry.js";

const ANCHOR_NAME_PREFIX = "aim-anchor-dot";
const SIDES: EdgeSide[] = ["top", "right", "bottom", "left"];

/**
 * Pull `(nodeId, side)` off a Konva node whose `name` is
 * `"aim-anchor-dot top"` (etc.). Returns null if the node isn't an anchor
 * dot or its parent Group doesn't carry an id.
 */
function readAnchorTarget(
  node: Konva.Node | null,
): { nodeId: string; side: EdgeSide } | null {
  if (!node) return null;
  const name = node.name?.() ?? "";
  if (!name.startsWith(ANCHOR_NAME_PREFIX)) return null;
  // Sibling A names the dots "aim-anchor-dot top" | "aim-anchor-dot right"
  // | ... . Extract the side from the trailing token.
  const parts = name.split(/\s+/);
  const tail = parts[parts.length - 1];
  const side = SIDES.find((s) => s === tail);
  if (!side) return null;
  // Walk up to the enclosing TextNode Group (named "text-node" by sibling B's
  // TextNode.tsx). Using findAncestor with `includeSelf=false`.
  const parentGroup = node.findAncestor("Group", false);
  // Konva's typing for findAncestor returns Konva.Node | undefined; coerce
  // to optional access for id().
  const id = (parentGroup as Konva.Node | null | undefined)?.id?.();
  if (typeof id !== "string" || id.length === 0) return null;
  return { nodeId: id, side };
}

/**
 * Hit-test the cursor (canvas space) against every OTHER card's anchors.
 * Returns the nearest anchor within EDGE_SNAP_THRESHOLD_CANVAS, or null.
 */
function findSnapTarget(
  cursorCanvas: { x: number; y: number },
  fromNodeId: string,
): DraftSnap | null {
  const nodes = useNodes.getState().nodes;
  let best: { dist: number; snap: DraftSnap } | null = null;
  const threshSq = EDGE_SNAP_THRESHOLD_CANVAS * EDGE_SNAP_THRESHOLD_CANVAS;
  for (const n of nodes) {
    if (n.id === fromNodeId) continue;
    for (const side of SIDES) {
      const p = anchorPosition(n, side);
      const dx = p.x - cursorCanvas.x;
      const dy = p.y - cursorCanvas.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > threshSq) continue;
      if (!best || d2 < best.dist) {
        best = { dist: d2, snap: { toNode: n.id, toSide: side } };
      }
    }
  }
  return best ? best.snap : null;
}

export interface DrawEdgeHandlers {
  /**
   * Returns `true` if the mousedown landed on an anchor dot and the draft
   * has been claimed (caller should NOT also pan). Otherwise returns
   * `false` and the normal Stage handlers should run.
   */
  onMouseDown(e: KonvaEventObject<MouseEvent>): boolean;
  onMouseMove(e: KonvaEventObject<MouseEvent>): void;
  onMouseUp(e: KonvaEventObject<MouseEvent>): void;
  /** Stop a draft mid-drag (e.g. on Stage mouseleave). */
  cancel(): void;
}

export function useDrawEdge(): DrawEdgeHandlers {
  const onMouseDown = useCallback((e: KonvaEventObject<MouseEvent>): boolean => {
    const target = e.target;
    const hit = readAnchorTarget(target);
    if (!hit) return false;
    // Prevent the underlying card's drag-to-move from also starting on this
    // mousedown. Konva's `cancelBubble = true` stops the event from reaching
    // the parent Group (which is `draggable`), so the user can drag away
    // cleanly to draw an edge without simultaneously moving the card.
    e.cancelBubble = true;

    const stage = target.getStage();
    if (!stage) return false;
    const pointer = stage.getPointerPosition();
    if (!pointer) return false;
    const v = useViewport.getState();
    const canvasCursor = screenToCanvas(pointer, v);

    useEdgeDraft.getState().start({
      fromNode: hit.nodeId,
      fromSide: hit.side,
      cursor: canvasCursor,
    });
    return true;
  }, []);

  const onMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const draft = useEdgeDraft.getState();
    if (!draft.active || !draft.fromNode) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const v = useViewport.getState();
    const canvasCursor = screenToCanvas(pointer, v);
    const snap = findSnapTarget(canvasCursor, draft.fromNode);
    draft.update({ cursor: canvasCursor, snap });
  }, []);

  const onMouseUp = useCallback((_e: KonvaEventObject<MouseEvent>) => {
    void _e;
    const draft = useEdgeDraft.getState();
    if (!draft.active) return;
    const snap = draft.snap;
    const fromNode = draft.fromNode;
    const fromSide = draft.fromSide;
    // Always cancel the draft first so even an early-return below leaves a
    // clean state.
    draft.cancel();
    if (!snap || !fromNode || !fromSide) return;
    if (snap.toNode === fromNode) return; // self-loop guard (belt and braces)
    // Phase 4 PR 1: capture right before the commit (after every early-return
    // guard above) so we only record history for a drag that actually creates
    // an edge — a cancelled drag leaves history untouched.
    useHistory.getState().capture();
    useEdges.getState().addEdge({
      id: makeEdgeId(),
      fromNode,
      toNode: snap.toNode,
      fromSide,
      toSide: snap.toSide,
      toEnd: "arrow",
    });
  }, []);

  const cancel = useCallback(() => {
    const draft = useEdgeDraft.getState();
    if (draft.active) draft.cancel();
  }, []);

  return { onMouseDown, onMouseMove, onMouseUp, cancel };
}
