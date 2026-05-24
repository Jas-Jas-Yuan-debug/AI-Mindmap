// Konva renderer for a single Edge.
//
// Phase 3 PR 1 scope (this file): pure renderer. Selection, label
// editing, drag-to-connect, and color-picker affordances arrive in
// sibling PRs 2 + 3.
//
// Render strategy:
//   1. Look up the from/to nodes by id from `useNodes`. Subscribing to
//      `nodes` (not the action functions) is what keeps the edge
//      visually attached to its endpoints during move + resize — Konva
//      re-renders this component on every node store change, which
//      recomputes the anchor positions and the Bezier control points
//      from scratch.
//   2. Resolve the anchor sides: if either `fromSide` / `toSide` is
//      unset, fall back to `defaultSidesFor` (geometry.ts) which picks
//      the closest pair.
//   3. Draw a Konva `<Path>` with a cubic Bezier `M x y C c1x c1y c2x
//      c2y tox toy` data string. Stroke color comes from `resolveColor`
//      when not selected, swapped to the primary purple ring when
//      selected (sibling C wires the `selected` prop).
//   4. Draw arrowhead `<Line closed>` shapes at each end whose `Edge`
//      end is "arrow". The arrowhead's orientation comes from the
//      adjacent Bezier control point so the tip lines up with the
//      curve's tangent at the endpoint.
//
// Defensive cases:
//   - If either endpoint node is missing (e.g. a stale edge whose node
//     was just deleted before the cascade ran), we render `null`.
//   - We never call into any store action from render — this component
//     is read-only against the stores.

import { useMemo } from "react";
import { Group, Line, Path } from "react-konva";
import { useNodes } from "../../store/nodes.js";
import { resolveColor } from "../nodes/TextNode.js";
import type { Edge as EdgeT } from "../../store/edges.js";
import {
  anchorPosition,
  arrowHeadPoints,
  bezierControlPoints,
  defaultSidesFor,
  EDGE_ARROW_SIZE,
} from "./geometry.js";

// --- Visual constants -------------------------------------------------
// Stroke colors match the design tokens already used in TextNode.tsx.
// Konva renders to canvas and can't read CSS custom properties, so we
// keep the hex literals here; Phase 8 will plumb a theme palette down.

const STROKE_COLOR_DEFAULT = "#1b1b1f"; // ink black — text color from §5b
const STROKE_COLOR_SELECTED = "#6965db"; // primary purple, matches TextNode selection ring
const STROKE_WIDTH_DEFAULT = 2;
const STROKE_WIDTH_SELECTED = 3;

export interface EdgeProps {
  edge: EdgeT;
  /** Sibling C will drive this from the selection store; defaults to
   *  false so PR 1 ships standalone. */
  selected?: boolean;
}

export function Edge({ edge, selected = false }: EdgeProps) {
  // Subscribing to the whole `nodes` array (rather than `getState()`-
  // ing it lazily) is what makes the edge follow node moves: any change
  // to `nodes` triggers a re-render of this component, which recomputes
  // the geometry from the fresh positions. The cost is bounded — Konva
  // only repaints the edge layer, and the geometry math is O(1).
  const nodes = useNodes((s) => s.nodes);

  const fromNode = useMemo(
    () => nodes.find((n) => n.id === edge.fromNode),
    [nodes, edge.fromNode],
  );
  const toNode = useMemo(
    () => nodes.find((n) => n.id === edge.toNode),
    [nodes, edge.toNode],
  );

  if (!fromNode || !toNode) {
    // Defensive: a cascade delete should clean this up immediately, but
    // if a race between two stores leaves a stale edge in flight, we'd
    // rather render nothing than crash.
    return null;
  }

  // Resolve sides. If the edge doesn't specify them, ask the geometry
  // helper to pick the closest pair.
  const fallback = defaultSidesFor(fromNode, toNode);
  const fromSide = edge.fromSide ?? fallback.fromSide;
  const toSide = edge.toSide ?? fallback.toSide;

  const from = anchorPosition(fromNode, fromSide);
  const to = anchorPosition(toNode, toSide);
  const { c1, c2 } = bezierControlPoints(from, to, fromSide, toSide);

  // Plan §5 defaults: fromEnd "none", toEnd "arrow".
  const fromEnd = edge.fromEnd ?? "none";
  const toEnd = edge.toEnd ?? "arrow";

  // Selected → primary purple. Otherwise: a user-set color via
  // resolveColor, or ink-black when no color is set. (`resolveColor`
  // returns `#ffffff` for undefined input, which is the right default
  // for a card *fill* but the wrong default for an edge *stroke* —
  // hence the explicit fallback here.)
  const stroke = selected
    ? STROKE_COLOR_SELECTED
    : edge.color !== undefined
      ? resolveColor(edge.color)
      : STROKE_COLOR_DEFAULT;
  const strokeWidth = selected ? STROKE_WIDTH_SELECTED : STROKE_WIDTH_DEFAULT;

  const pathData = `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;

  // Arrowhead points: the tangent at the curve endpoint is parallel to
  // (control point → endpoint), so we use c2 → to for the toEnd head
  // and c1 → from for the fromEnd head.
  const toHead =
    toEnd === "arrow" ? arrowHeadPoints(to, c2, EDGE_ARROW_SIZE) : null;
  const fromHead =
    fromEnd === "arrow" ? arrowHeadPoints(from, c1, EDGE_ARROW_SIZE) : null;

  return (
    <Group name="aim-edge" id={edge.id}>
      <Path
        data={pathData}
        stroke={stroke}
        strokeWidth={strokeWidth}
        // No fill — Konva's Path defaults to filling closed shapes; an
        // open Bezier ends up filled with a wedge if we leave fill
        // unset. Empty string = no fill.
        fill=""
        // Constant line weight under zoom so a 2px line at zoom 4 still
        // reads as 2px on screen, matching the TextNode border.
        strokeScaleEnabled={false}
        // Don't intercept pointer events from this PR — sibling C will
        // flip this on when wiring edge selection.
        listening={false}
        lineCap="round"
        lineJoin="round"
      />
      {toHead ? (
        <Line
          points={toHead.flatMap((p) => [p.x, p.y])}
          closed
          fill={stroke}
          stroke={stroke}
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
          lineJoin="round"
        />
      ) : null}
      {fromHead ? (
        <Line
          points={fromHead.flatMap((p) => [p.x, p.y])}
          closed
          fill={stroke}
          stroke={stroke}
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
          lineJoin="round"
        />
      ) : null}
    </Group>
  );
}

export default Edge;
