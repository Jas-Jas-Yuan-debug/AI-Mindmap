// Pure geometry for the Phase 4 lasso (marquee) selection.
//
// No React, no Konva, no DOM imports — same discipline as layout.ts and
// resize.ts so the hit-test is unit-testable in isolation and the renderer
// has a single source of truth for "which nodes does this rectangle select".
//
// CRITICAL design choice: the lasso operates entirely in CANVAS space. The
// hook (useLasso.ts) converts the screen-space cursor to canvas space via
// `screenToCanvas` before feeding points here. Because both the lasso rect
// and the node AABBs are in canvas coords, the hit-test is zoom-independent:
// scaling the viewport scales the lasso rect and the nodes by the same
// factor, so their overlap relationship is unchanged. The Phase 4 exit
// criterion "lasso select correctly hit-tests at any zoom level" falls out
// of this for free, and the zoom-independence is asserted in lasso.test.ts.

/** An axis-aligned bounding box in canvas space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The two corner points of a drag, in canvas space. */
export interface LassoRect {
  /** Drag start corner. */
  x1: number;
  y1: number;
  /** Drag current/end corner. */
  x2: number;
  y2: number;
}

/**
 * Normalize a two-corner drag into a positive-extent AABB. The user can drag
 * in any of the four diagonal directions; this collapses all of them to the
 * canonical `{x, y, width, height}` form (top-left origin, non-negative
 * width/height) that `rectsIntersect` expects and that Konva's <Rect> wants.
 */
export function normalizeLasso(l: LassoRect): Rect {
  const x = Math.min(l.x1, l.x2);
  const y = Math.min(l.y1, l.y2);
  const width = Math.abs(l.x2 - l.x1);
  const height = Math.abs(l.y2 - l.y1);
  return { x, y, width, height };
}

/**
 * AABB overlap test. Returns true when rectangles `a` and `b` share any area
 * OR touch along an edge/corner (boundaries are inclusive — a node whose edge
 * exactly grazes the lasso edge counts as selected, which matches user
 * expectation when dragging a marquee right up against a card).
 *
 * Both rects are assumed normalized (non-negative width/height); callers pass
 * node AABBs (always positive) and `normalizeLasso(...)` output.
 *
 * Standard separating-axis form: two AABBs are disjoint iff one is entirely
 * to the left/right/above/below the other. We invert that to get overlap.
 * Using `<` (strict) on the separation test makes touching edges count as
 * intersecting.
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  // Separated if a is fully left of b, fully right of b, fully above, or
  // fully below. `aRight < b.x` (strict) ⇒ touching edges are NOT separated.
  if (aRight < b.x) return false;
  if (a.x > bRight) return false;
  if (aBottom < b.y) return false;
  if (a.y > bBottom) return false;
  return true;
}

/** Minimal node shape the hit-test needs — id plus its canvas-space AABB. */
export interface LassoTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Return the ids of every target whose AABB intersects the (already
 * normalized) lasso rect. Order follows the input order so the result is
 * deterministic for tests.
 */
export function nodesInLasso(targets: readonly LassoTarget[], lasso: Rect): string[] {
  const hits: string[] = [];
  for (const t of targets) {
    if (rectsIntersect({ x: t.x, y: t.y, width: t.width, height: t.height }, lasso)) {
      hits.push(t.id);
    }
  }
  return hits;
}
