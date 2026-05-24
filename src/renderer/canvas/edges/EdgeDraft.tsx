// Ghost edge rendered while the user is drag-to-connecting from an anchor.
//
// Reads `useEdgeDraft` and paints a dashed, lighter Bezier curve from the
// source anchor to either:
//   - the snap target's anchor (when `draft.snap` is set), or
//   - the raw cursor (canvas space), when no snap is in range.
//
// Visual language:
//   - Dashed line and slightly thinner stroke distinguish the draft from a
//     committed edge (which sibling A renders as a solid Bezier).
//   - When snapped, the line goes solid-ish: we drop the dashed look so the
//     user gets a clear "this WILL connect on release" affordance.
//
// Mounted by Canvas.tsx inside its own thin <Layer> sitting on top of the
// EdgesLayer (so the ghost is above committed edges) but below the Nodes
// layer (so the ghost can pass under card edges and not occlude them). That
// also keeps us out of sibling A's EdgesLayer.tsx file ownership — no
// merge conflict on PR coordination.

import { Line } from "react-konva";
import { useEdgeDraft } from "../../store/edgeDraft.js";
import { useNodes } from "../../store/nodes.js";
import {
  anchorPosition,
  bezierControlPoints,
  defaultSidesFor,
  type Point,
} from "./geometry.js";
import type { EdgeSide } from "../../store/edges.js";

const DRAFT_STROKE = "#6965db"; // brand primary
const DRAFT_OPACITY_DASHED = 0.5;
const DRAFT_OPACITY_SNAPPED = 0.85;
const DRAFT_DASH: [number, number] = [6, 4];
const DRAFT_STROKE_WIDTH = 1.5;

/**
 * Find a node by id from the nodes store. Returns null if the source node
 * has been deleted mid-drag (rare but possible if a Delete keypress fires
 * during the gesture).
 */
function findNode(id: string) {
  return useNodes.getState().nodes.find((n) => n.id === id) ?? null;
}

export function EdgeDraft() {
  // Subscribe to the active flag and cursor so this component re-renders on
  // every mousemove. Konva is fast enough at 60Hz redraws of a single Line.
  const active = useEdgeDraft((s) => s.active);
  const cursor = useEdgeDraft((s) => s.cursor);
  const fromNodeId = useEdgeDraft((s) => s.fromNode);
  const fromSide = useEdgeDraft((s) => s.fromSide);
  const snap = useEdgeDraft((s) => s.snap);

  if (!active || !cursor || !fromNodeId || !fromSide) return null;

  const fromNode = findNode(fromNodeId);
  if (!fromNode) return null;

  const fromPoint: Point = anchorPosition(fromNode, fromSide);

  // Build the endpoint. When snapped, use the target anchor exactly. When
  // not snapped, use the cursor; pick an opposite-ish "phantom" side from
  // defaultSidesFor against a tiny 1×1 box at the cursor so the Bezier
  // curves smoothly toward the cursor. Cheap.
  let toPoint: Point;
  let toSide: EdgeSide;
  if (snap) {
    const toNode = findNode(snap.toNode);
    if (!toNode) {
      // Node disappeared between mousemove and render — fall back to cursor.
      toPoint = cursor;
      const phantom = defaultSidesFor(fromNode, {
        x: cursor.x,
        y: cursor.y,
        width: 1,
        height: 1,
      });
      toSide = phantom.toSide;
    } else {
      toPoint = anchorPosition(toNode, snap.toSide);
      toSide = snap.toSide;
    }
  } else {
    toPoint = cursor;
    const phantom = defaultSidesFor(fromNode, {
      x: cursor.x,
      y: cursor.y,
      width: 1,
      height: 1,
    });
    toSide = phantom.toSide;
  }

  const { c1, c2 } = bezierControlPoints(fromPoint, toPoint, fromSide, toSide);

  // Konva's <Line> with `bezier` flag and a 4-point control list draws a
  // single cubic Bezier — matches what sibling A's Edge.tsx renders.
  const points = [fromPoint.x, fromPoint.y, c1.x, c1.y, c2.x, c2.y, toPoint.x, toPoint.y];

  // Build the props conditionally so we never pass `dash: undefined`
  // (exactOptionalPropertyTypes forbids it on a Konva LineConfig where
  // `dash?: number[]`). When snapped we omit the prop entirely so the
  // line renders solid; otherwise we provide the dash array.
  const dashProps = snap ? {} : { dash: [...DRAFT_DASH] };

  return (
    <Line
      points={points}
      bezier
      stroke={DRAFT_STROKE}
      strokeWidth={DRAFT_STROKE_WIDTH}
      // Keep visual weight constant under zoom — matches the rest of the
      // chrome (selection ring, resize handles).
      strokeScaleEnabled={false}
      lineCap="round"
      lineJoin="round"
      opacity={snap ? DRAFT_OPACITY_SNAPPED : DRAFT_OPACITY_DASHED}
      {...dashProps}
      // Pointer-events off so the ghost itself doesn't intercept the user's
      // mouseup at the destination.
      listening={false}
    />
  );
}

export default EdgeDraft;
