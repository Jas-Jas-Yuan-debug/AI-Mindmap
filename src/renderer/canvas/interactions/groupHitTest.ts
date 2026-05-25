// Pure geometry for Phase 6 group drag/reparent interactions (sibling
// subagent B).
//
// No React, no Konva, no DOM imports — same discipline as resize.ts /
// layout.ts so the hit-test math can be unit-tested in isolation. The
// renderer (GroupNode.tsx / TextNode.tsx) converts Konva drag positions into
// plain {x,y,width,height} rects and calls these to answer:
//
//   - "which group did this node get dropped into?"  → groupDropTarget
//   - "is this child still (mostly) inside its group?" → isMostlyInside
//
// All reparenting decisions route their geometry through here so the rules
// live in ONE place and are covered by the unit tests in
// `groupHitTest.test.ts`. The actual `setParent` call (and its cycle guard)
// stays in the store (reparent.ts) — these helpers never mutate.

/** Axis-aligned bounding box in canvas space. */
export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The {x,y} center of an AABB. */
export function centerOf(box: AABB): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Is point `p` inside (or on the edge of) `box`? */
export function pointInBox(
  p: { x: number; y: number },
  box: AABB,
): boolean {
  return (
    p.x >= box.x &&
    p.x <= box.x + box.width &&
    p.y >= box.y &&
    p.y <= box.y + box.height
  );
}

/**
 * Area of the intersection of two AABBs (0 if they don't overlap). Used to
 * decide whether a child is "mostly" inside its group after a resize.
 */
export function intersectionArea(a: AABB, b: AABB): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

/**
 * Is `child` mostly (≥ `threshold` of its own area) inside `container`?
 *
 * Used on group-resize: a child whose overlap with the group's NEW bounds
 * drops below the threshold is considered "outside" and gets detached. A
 * default of 0.5 means "more than half of the child still sits in the group"
 * keeps it parented — forgiving enough that a sliver poking out doesn't pop a
 * child loose, strict enough that a child mostly outside the new rect leaves.
 */
export function isMostlyInside(
  child: AABB,
  container: AABB,
  threshold = 0.5,
): boolean {
  const childArea = child.width * child.height;
  if (childArea <= 0) return false;
  return intersectionArea(child, container) / childArea >= threshold;
}

/** A group candidate for a drop hit-test: its id + its AABB. */
export interface GroupCandidate extends AABB {
  id: string;
}

/**
 * Given a dragged node's AABB and the candidate groups it could land in,
 * return the id of the group whose bounds contain the node's CENTER — or
 * `null` if the center is over empty canvas (a drag-out).
 *
 * Center-based (not full-containment) so dropping a large node that overhangs
 * a group's edges still parents it, matching the "drop the card on the group"
 * mental model. `excludeIds` skips groups the node must not parent into — the
 * caller passes the dragged node's own id plus its descendants so a group
 * can't be dropped into itself or its own subtree (the store's cycle guard is
 * the backstop, but excluding here avoids a flicker of "valid target").
 *
 * When the center sits inside multiple (nested) groups, the INNERMOST wins:
 * we pick the candidate with the smallest area, so dropping onto a child
 * group parents into that child group, not its ancestor. Candidates are
 * expected to be the rendered group rects; ties (equal area) resolve to the
 * last one in iteration order (later = rendered on top in array order).
 */
export function groupDropTarget(
  dragged: AABB,
  candidates: readonly GroupCandidate[],
  excludeIds: ReadonlySet<string> = new Set(),
): string | null {
  const c = centerOf(dragged);
  let best: GroupCandidate | null = null;
  let bestArea = Infinity;
  for (const cand of candidates) {
    if (excludeIds.has(cand.id)) continue;
    if (!pointInBox(c, cand)) continue;
    const area = cand.width * cand.height;
    if (area <= bestArea) {
      best = cand;
      bestArea = area;
    }
  }
  return best ? best.id : null;
}
