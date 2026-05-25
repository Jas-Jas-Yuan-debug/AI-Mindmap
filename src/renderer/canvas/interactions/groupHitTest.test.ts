// Unit tests for the Phase 6 group drag/reparent geometry (sibling subagent
// B). Pure AABB math only — no Konva/DOM, mirroring resize.test.ts style.
//
// Covers the two decisions the renderer routes through these helpers:
//   - groupDropTarget: which group (if any) does a dropped node land in,
//     including nested-group innermost-wins and self/descendant exclusion.
//   - isMostlyInside: does a child survive a group resize or get detached.

import { describe, expect, test } from "vitest";
import {
  centerOf,
  groupDropTarget,
  intersectionArea,
  isMostlyInside,
  pointInBox,
  type AABB,
  type GroupCandidate,
} from "./groupHitTest.js";

// --- centerOf / pointInBox ------------------------------------------------

describe("centerOf", () => {
  test("returns the geometric center of an AABB", () => {
    expect(centerOf({ x: 0, y: 0, width: 100, height: 40 })).toEqual({
      x: 50,
      y: 20,
    });
  });
});

describe("pointInBox", () => {
  const box: AABB = { x: 10, y: 10, width: 100, height: 100 };
  test("a point inside is inside", () => {
    expect(pointInBox({ x: 50, y: 50 }, box)).toBe(true);
  });
  test("a point on the edge counts as inside", () => {
    expect(pointInBox({ x: 10, y: 10 }, box)).toBe(true);
    expect(pointInBox({ x: 110, y: 110 }, box)).toBe(true);
  });
  test("a point outside is outside", () => {
    expect(pointInBox({ x: 5, y: 50 }, box)).toBe(false);
    expect(pointInBox({ x: 200, y: 200 }, box)).toBe(false);
  });
});

// --- intersectionArea / isMostlyInside ------------------------------------

describe("intersectionArea", () => {
  test("disjoint boxes have zero overlap", () => {
    const a: AABB = { x: 0, y: 0, width: 10, height: 10 };
    const b: AABB = { x: 100, y: 100, width: 10, height: 10 };
    expect(intersectionArea(a, b)).toBe(0);
  });
  test("computes the overlapping rectangle's area", () => {
    const a: AABB = { x: 0, y: 0, width: 100, height: 100 };
    const b: AABB = { x: 50, y: 50, width: 100, height: 100 };
    expect(intersectionArea(a, b)).toBe(50 * 50);
  });
});

describe("isMostlyInside", () => {
  const group: AABB = { x: 0, y: 0, width: 400, height: 300 };
  test("a fully-contained child is inside", () => {
    const child: AABB = { x: 50, y: 50, width: 100, height: 80 };
    expect(isMostlyInside(child, group)).toBe(true);
  });
  test("a child mostly outside (only a sliver in) is NOT inside", () => {
    // Child spans x 370..470; only x 370..400 (30 of its 100 width) overlaps
    // the group → 30% area → detach.
    const child: AABB = { x: 370, y: 50, width: 100, height: 80 };
    expect(isMostlyInside(child, group)).toBe(false);
  });
  test("a child exactly straddling the edge at >50% stays inside", () => {
    // 60 of its 100 width is inside (x 340..400), full height → 60% area.
    const child: AABB = { x: 340, y: 50, width: 100, height: 80 };
    expect(isMostlyInside(child, group)).toBe(true);
  });
  test("a child fully outside the new bounds is detached", () => {
    const child: AABB = { x: 500, y: 500, width: 100, height: 80 };
    expect(isMostlyInside(child, group)).toBe(false);
  });
  test("respects a custom threshold", () => {
    // 60% overlap: inside at threshold 0.5, outside at threshold 0.75.
    const child: AABB = { x: 340, y: 50, width: 100, height: 80 };
    expect(isMostlyInside(child, group, 0.75)).toBe(false);
  });
});

// --- groupDropTarget ------------------------------------------------------

describe("groupDropTarget", () => {
  // Two top-level groups side by side.
  const A: GroupCandidate = { id: "A", x: 0, y: 0, width: 200, height: 200 };
  const B: GroupCandidate = { id: "B", x: 300, y: 0, width: 200, height: 200 };

  test("a node whose center is inside a group lands in that group", () => {
    // Center at (50,50) — inside A.
    const dragged: AABB = { x: 0, y: 0, width: 100, height: 100 };
    expect(groupDropTarget(dragged, [A, B])).toBe("A");
  });

  test("a node dropped over empty canvas lands nowhere (null = detach)", () => {
    // Center at (250,250) — between/below both.
    const dragged: AABB = { x: 220, y: 220, width: 60, height: 60 };
    expect(groupDropTarget(dragged, [A, B])).toBeNull();
  });

  test("center-based: a card overhanging the edge still parents in", () => {
    // Card wider than A, but its center (at x≈180) is still inside A.
    const dragged: AABB = { x: 80, y: 80, width: 200, height: 40 };
    // center.x = 180 (inside A's 0..200), center.y = 100 → inside A.
    expect(groupDropTarget(dragged, [A, B])).toBe("A");
  });

  test("nested groups: innermost (smallest) group wins", () => {
    const outer: GroupCandidate = {
      id: "outer",
      x: 0,
      y: 0,
      width: 400,
      height: 400,
    };
    const inner: GroupCandidate = {
      id: "inner",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    };
    // Center at (100,100) — inside BOTH; inner is smaller → wins.
    const dragged: AABB = { x: 90, y: 90, width: 20, height: 20 };
    expect(groupDropTarget(dragged, [outer, inner])).toBe("inner");
  });

  test("excludeIds skips the node's own group + its descendants", () => {
    // Dropping group "outer" — its center is inside itself; excluding it (and
    // any descendant) means the result is null (can't drop into own subtree).
    const outer: GroupCandidate = {
      id: "outer",
      x: 0,
      y: 0,
      width: 400,
      height: 400,
    };
    const dragged: AABB = { x: 0, y: 0, width: 400, height: 400 };
    expect(
      groupDropTarget(dragged, [outer], new Set(["outer"])),
    ).toBeNull();
  });

  test("a group can be dropped into a larger sibling group", () => {
    const big: GroupCandidate = {
      id: "big",
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    };
    const small: GroupCandidate = {
      id: "small",
      x: 100,
      y: 100,
      width: 120,
      height: 120,
    };
    // Dragging "small" (exclude itself); its center (160,160) is inside big.
    expect(
      groupDropTarget(small, [big, small], new Set(["small"])),
    ).toBe("big");
  });

  test("no candidates → null", () => {
    const dragged: AABB = { x: 0, y: 0, width: 10, height: 10 };
    expect(groupDropTarget(dragged, [])).toBeNull();
  });
});
