// Pure geometry math for edge rendering.
//
// This module is intentionally framework-free — no React, no Konva, no
// store imports. That keeps it (a) easy to unit-test in isolation,
// (b) cheap to call from the render hot path, and (c) reusable from
// sibling B's drag-to-connect interaction code, which needs the same
// anchor positions for snap targets.
//
// Coordinate convention matches the rest of the canvas: +x right, +y
// down, in canvas-space (i.e. before the Stage transform applies the
// viewport pan/zoom).
//
// Public API used by sibling subagents:
//   - `anchorPosition(node, side)` — where a given anchor sits on a
//     node's bounding rect.
//   - `defaultSidesFor(fromNode, toNode)` — pick the (fromSide, toSide)
//     pair whose anchors are closest. Used when an edge has neither
//     `fromSide` nor `toSide` set (e.g. a freshly created edge from a
//     drag-to-connect interaction that hasn't picked sides yet).
//   - `bezierControlPoints(from, to, fromSide, toSide)` — the two cubic
//     control points for the Bezier path between two anchors. Control
//     points are pushed perpendicular to the anchor's side, with an
//     offset that scales with the anchor distance (clamped).
//   - `arrowHeadPoints(tip, fromControl, size)` — the three triangle
//     points for an arrowhead, oriented along the (fromControl → tip)
//     direction.

/** Constants exported so the renderer + tests stay in sync. */
export const EDGE_ARROW_SIZE = 12;
export const EDGE_CONTROL_OFFSET_MIN = 40;
export const EDGE_CONTROL_OFFSET_MAX = 200;

export type EdgeSide = "top" | "right" | "bottom" | "left";

export interface Point {
  x: number;
  y: number;
}

/** Minimal rectangle shape — matches `NodeBase` from the store but with
 *  only the fields we actually need here, so this module stays
 *  type-independent of the store. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Position of the anchor point on side `side` of `node`'s bounding rect.
 *
 *   top    → midpoint of the top edge    (x + width/2, y)
 *   right  → midpoint of the right edge  (x + width,   y + height/2)
 *   bottom → midpoint of the bottom edge (x + width/2, y + height)
 *   left   → midpoint of the left edge   (x,           y + height/2)
 *
 * For a node `{x:100, y:50, width:240, height:80}`:
 *   top    → (220, 50)
 *   right  → (340, 90)
 *   bottom → (220, 130)
 *   left   → (100, 90)
 */
export function anchorPosition(node: Rect, side: EdgeSide): Point {
  switch (side) {
    case "top":
      return { x: node.x + node.width / 2, y: node.y };
    case "right":
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case "bottom":
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case "left":
      return { x: node.x, y: node.y + node.height / 2 };
  }
}

/**
 * Pick the (fromSide, toSide) pair that minimizes the distance between
 * anchor points. This is what we fall back to when an edge has neither
 * `fromSide` nor `toSide` set, or for a drag-to-connect preview before
 * the user has committed to specific anchors.
 *
 * 16 candidate pairs (4 × 4); brute-force is trivially fast at our
 * scale and trivially correct. If `fromNode === toNode` (loop edge —
 * defensive case), we return a stable but visually distinct pair so
 * the renderer still draws something rather than a zero-length line.
 */
export function defaultSidesFor(
  fromNode: Rect,
  toNode: Rect,
): { fromSide: EdgeSide; toSide: EdgeSide } {
  const sides: EdgeSide[] = ["top", "right", "bottom", "left"];

  // Loop / coincident-rect defensive case: stick a loop from right →
  // left so the renderer can still draw a curve, rather than picking
  // top → top with zero offset.
  if (
    fromNode.x === toNode.x &&
    fromNode.y === toNode.y &&
    fromNode.width === toNode.width &&
    fromNode.height === toNode.height
  ) {
    return { fromSide: "right", toSide: "left" };
  }

  let best: { fromSide: EdgeSide; toSide: EdgeSide; d: number } = {
    fromSide: "right",
    toSide: "left",
    d: Infinity,
  };
  for (const fs of sides) {
    const a = anchorPosition(fromNode, fs);
    for (const ts of sides) {
      const b = anchorPosition(toNode, ts);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < best.d) {
        best = { fromSide: fs, toSide: ts, d };
      }
    }
  }
  return { fromSide: best.fromSide, toSide: best.toSide };
}

/** Unit outward normal for a side (the direction the control point gets
 *  pushed from the anchor). */
function sideNormal(side: EdgeSide): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
}

/**
 * Cubic Bezier control points for an edge between `from` (on `fromSide`)
 * and `to` (on `toSide`).
 *
 * Both control points are offset perpendicular to their respective
 * sides — i.e. along the outward normal. The offset magnitude scales
 * with the straight-line distance between anchors so short edges stay
 * snappy and long edges curve gracefully. Clamped to
 * [EDGE_CONTROL_OFFSET_MIN, EDGE_CONTROL_OFFSET_MAX] to keep the curve
 * shape reasonable at extremes.
 *
 * Direction sign is verified by the unit tests:
 *   - fromSide "right"  → c1.x > from.x
 *   - fromSide "left"   → c1.x < from.x
 *   - fromSide "top"    → c1.y < from.y
 *   - fromSide "bottom" → c1.y > from.y
 * (and analogously for `to`/`toSide` on `c2`.)
 */
export function bezierControlPoints(
  from: Point,
  to: Point,
  fromSide: EdgeSide,
  toSide: EdgeSide,
): { c1: Point; c2: Point } {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const raw = distance / 2;
  const offset = Math.min(
    EDGE_CONTROL_OFFSET_MAX,
    Math.max(EDGE_CONTROL_OFFSET_MIN, raw),
  );
  const n1 = sideNormal(fromSide);
  const n2 = sideNormal(toSide);
  return {
    c1: { x: from.x + n1.x * offset, y: from.y + n1.y * offset },
    c2: { x: to.x + n2.x * offset, y: to.y + n2.y * offset },
  };
}

/**
 * Three triangle points for an arrowhead whose tip is at `tip` and
 * whose orientation points from `fromControl` → `tip` (so the head
 * lines up with the tangent of the Bezier curve at its endpoint when
 * `fromControl` is the adjacent control point of the cubic).
 *
 * `size` is the length of the head from tip to base along the
 * direction axis. The base is two points offset perpendicular by
 * `size/2` from the axis — a 1:1 base-to-height isoceles triangle.
 *
 * Defensive: if `fromControl == tip` (degenerate direction), we fall
 * back to a leftward-pointing triangle so the renderer still draws
 * something.
 */
export function arrowHeadPoints(
  tip: Point,
  fromControl: Point,
  size: number,
): [Point, Point, Point] {
  const dx = tip.x - fromControl.x;
  const dy = tip.y - fromControl.y;
  const len = Math.hypot(dx, dy);
  // Unit direction from fromControl → tip; default to (1, 0) when
  // degenerate so the head still has a finite shape.
  const ux = len === 0 ? 1 : dx / len;
  const uy = len === 0 ? 0 : dy / len;
  // Perpendicular (rotated +90°): (-uy, ux)
  const px = -uy;
  const py = ux;
  const half = size / 2;
  const baseX = tip.x - ux * size;
  const baseY = tip.y - uy * size;
  const left: Point = { x: baseX + px * half, y: baseY + py * half };
  const right: Point = { x: baseX - px * half, y: baseY - py * half };
  return [tip, left, right];
}
