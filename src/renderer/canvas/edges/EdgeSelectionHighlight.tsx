// Konva Layer that draws a focus overlay for the currently-selected edge.
//
// Phase 3 PR 3 (sibling subagent C). Why a separate layer instead of
// threading `selected` through sibling A's `<Edge>` component:
//
//   - A's EdgesLayer renders every edge with `selected={false}` by default;
//     wrapping that layer to thread selection state would require either
//     editing A's file (file-conflict risk during the parallel race) or
//     duplicating A's mapping logic. A separate "highlight on top" overlay
//     leaves A's foundation untouched.
//   - Konva re-renders only the layers whose nodes change. Selecting an
//     edge mutates this layer (1–2 shapes), not the whole edges layer
//     (which holds N shapes). At 200 edges that's the cheaper path.
//
// Visual: a thick purple stroke drawn over the same Bezier as the underlying
// edge, plus an arrow head at the toNode end. The geometry helpers come
// from sibling A's `./geometry.ts` so we don't recompute control points.
//
// Defensive: when the selected edge id refers to a missing edge (deleted
// mid-flight, e.g. after Delete key) or to a missing endpoint node, we
// render nothing and let the next state cycle clear the dangling selection.

import { useMemo } from "react";
import { Group, Layer, Line, Shape } from "react-konva";
import type { Context } from "konva/lib/Context";
import type { Shape as KonvaShape } from "konva/lib/Shape";
import { useEdges } from "../../store/edges.js";
import { useEdgeSelection } from "../../store/edgeSelection.js";
import { useNodes } from "../../store/nodes.js";
import {
  anchorPosition,
  arrowHeadPoints,
  bezierControlPoints,
  defaultSidesFor,
  EDGE_ARROW_SIZE,
} from "./geometry.js";

// Highlight visuals — purple matches the brand primary (`#6965db`) used by
// `TextNode.tsx`'s selection ring, so node + edge selection look consistent.
const HIGHLIGHT_COLOR = "#6965db";
const HIGHLIGHT_WIDTH = 4;
const HIGHLIGHT_OPACITY = 0.55;

export function EdgeSelectionHighlight() {
  const selectedEdgeId = useEdgeSelection((s) => s.selectedEdgeId);
  const edges = useEdges((s) => s.edges);
  const nodes = useNodes((s) => s.nodes);

  const overlay = useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return null;
    const fromNode = nodes.find((n) => n.id === edge.fromNode);
    const toNode = nodes.find((n) => n.id === edge.toNode);
    if (!fromNode || !toNode) return null;

    // Resolve effective sides: explicit overrides on the edge win;
    // otherwise let geometry.ts pick a sensible default.
    const fallback = defaultSidesFor(fromNode, toNode);
    const fromSide = edge.fromSide ?? fallback.fromSide;
    const toSide = edge.toSide ?? fallback.toSide;

    const start = anchorPosition(fromNode, fromSide);
    const end = anchorPosition(toNode, toSide);
    const { c1, c2 } = bezierControlPoints(start, end, fromSide, toSide);
    // Show an arrowhead overlay on whichever ends have a real arrow on
    // the underlying edge (plan §5 default: fromEnd "none", toEnd "arrow").
    const toEnd = edge.toEnd ?? "arrow";
    const fromEnd = edge.fromEnd ?? "none";
    const toHead =
      toEnd === "arrow" ? arrowHeadPoints(end, c2, EDGE_ARROW_SIZE) : null;
    const fromHead =
      fromEnd === "arrow" ? arrowHeadPoints(start, c1, EDGE_ARROW_SIZE) : null;

    return { start, end, c1, c2, toHead, fromHead };
  }, [selectedEdgeId, edges, nodes]);

  if (!overlay) return null;

  const { start, end, c1, c2, toHead, fromHead } = overlay;

  return (
    <Layer listening={false}>
      <Group opacity={HIGHLIGHT_OPACITY}>
        <Shape
          sceneFunc={(ctx: Context, shape: KonvaShape) => {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
            ctx.strokeShape(shape);
          }}
          stroke={HIGHLIGHT_COLOR}
          strokeWidth={HIGHLIGHT_WIDTH}
          strokeScaleEnabled={false}
          lineCap="round"
          lineJoin="round"
        />
        {toHead ? (
          <Line
            points={toHead.flatMap((p) => [p.x, p.y])}
            closed
            fill={HIGHLIGHT_COLOR}
            stroke={HIGHLIGHT_COLOR}
            strokeWidth={2}
            strokeScaleEnabled={false}
            lineJoin="round"
          />
        ) : null}
        {fromHead ? (
          <Line
            points={fromHead.flatMap((p) => [p.x, p.y])}
            closed
            fill={HIGHLIGHT_COLOR}
            stroke={HIGHLIGHT_COLOR}
            strokeWidth={2}
            strokeScaleEnabled={false}
            lineJoin="round"
          />
        ) : null}
      </Group>
    </Layer>
  );
}

export default EdgeSelectionHighlight;
