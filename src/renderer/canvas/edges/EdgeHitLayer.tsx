// Invisible Konva Layer that provides pointer-event hit targets for edges.
//
// Phase 3 PR 3 (sibling subagent C). Why this exists: sibling A's `<Edge>`
// renders the visible Bezier with `listening={false}` so edges don't steal
// drag / pan events from the empty canvas. That makes them un-clickable.
// Sibling C needs click hit-testing for selection AND right-click hit-
// testing for the color picker — both via the `name="aim-edge"` + `id`
// stamp pattern.
//
// Rather than mutate A's Edge.tsx (file-conflict risk, and turning
// listening on for the visible Path would break the empty-canvas pan),
// we layer transparent "hit shapes" on top. Each hit shape:
//   - Reproduces the same Bezier path as the visible edge.
//   - Is stroked transparent so it doesn't draw anything.
//   - Has a wider stroke (HIT_STROKE_WIDTH) than the visible line so
//     the user has a generous click target — small mouse movements
//     during a click won't drop the selection.
//   - Has `name="aim-edge"` and `id={edge.id}` so the existing hit-test
//     code (`useEdgeSelectClick`, `useEdgeContextMenu`) works against
//     it identically to A's Edge group.
//
// Layer order in Canvas.tsx:
//   1. EdgesLayer (A's, visible bezier, non-listening)
//   2. EdgeHitLayer (this, transparent hit targets, listening)
//   3. EdgeSelectionHighlight (visible focus overlay, non-listening)
//   4. Nodes (visible, listening — cards take precedence over edges
//      when a click lands on overlapping area, which matches user
//      intuition: an arrow drawn behind a card is owned by the card.)

import { Group, Layer, Shape } from "react-konva";
import type { Context } from "konva/lib/Context";
import type { Shape as KonvaShape } from "konva/lib/Shape";
import { useEdges } from "../../store/edges.js";
import { useNodes } from "../../store/nodes.js";
import {
  anchorPosition,
  bezierControlPoints,
  defaultSidesFor,
} from "./geometry.js";

// Wider than the visible 2px stroke so a click within ~6px of the curve
// still selects. Konva's hit-test against a stroked path is exact-geom,
// not "near the line", so this width is the user-friendly slop.
const HIT_STROKE_WIDTH = 12;

export function EdgeHitLayer() {
  const edges = useEdges((s) => s.edges);
  const nodes = useNodes((s) => s.nodes);

  return (
    <Layer>
      {edges.map((edge) => {
        const fromNode = nodes.find((n) => n.id === edge.fromNode);
        const toNode = nodes.find((n) => n.id === edge.toNode);
        if (!fromNode || !toNode) return null;

        const fallback = defaultSidesFor(fromNode, toNode);
        const fromSide = edge.fromSide ?? fallback.fromSide;
        const toSide = edge.toSide ?? fallback.toSide;
        const from = anchorPosition(fromNode, fromSide);
        const to = anchorPosition(toNode, toSide);
        const { c1, c2 } = bezierControlPoints(from, to, fromSide, toSide);

        return (
          <Group key={edge.id} name="aim-edge" id={edge.id}>
            <Shape
              sceneFunc={(ctx: Context, shape: KonvaShape) => {
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
                ctx.strokeShape(shape);
              }}
              // Custom hit region: Konva can't infer the geometry of a
              // sceneFunc-only Shape, so we paint the same curve into
              // the hit canvas with a generous width. This makes the
              // edge clickable along its entire length.
              hitFunc={(ctx: Context, shape: KonvaShape) => {
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
                ctx.lineWidth = HIT_STROKE_WIDTH;
                ctx.strokeShape(shape);
              }}
              // Stroke transparently — the visible curve is drawn by
              // sibling A's EdgesLayer underneath us.
              stroke="rgba(0,0,0,0)"
              strokeWidth={HIT_STROKE_WIDTH}
              strokeScaleEnabled={false}
              lineCap="round"
              lineJoin="round"
            />
          </Group>
        );
      })}
    </Layer>
  );
}

export default EdgeHitLayer;
