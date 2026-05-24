// Unit tests for the pure edge geometry math. These run under jsdom but
// don't actually touch the DOM — geometry.ts is framework-free.
//
// Coverage map vs the §6 Phase 3 exit criterion "unit tests for edge
// anchor geometry":
//   - anchorPosition: 4 sides on a known rect (literal expected values)
//   - defaultSidesFor: cardinal directions + 4 diagonals + the
//     defensive coincident-rect case (loop)
//   - bezierControlPoints: direction sign checks + offset clamping at
//     both ends
//   - arrowHeadPoints: 3 distinct points, positive triangle area,
//     degenerate-input fallback

import { describe, expect, it } from "vitest";
import {
  anchorPosition,
  arrowHeadPoints,
  bezierControlPoints,
  defaultSidesFor,
  EDGE_ARROW_SIZE,
  EDGE_CONTROL_OFFSET_MAX,
  EDGE_CONTROL_OFFSET_MIN,
} from "./geometry.js";

const RECT = { x: 100, y: 50, width: 240, height: 80 };

describe("anchorPosition", () => {
  it("top is the midpoint of the top edge", () => {
    expect(anchorPosition(RECT, "top")).toEqual({ x: 220, y: 50 });
  });
  it("right is the midpoint of the right edge", () => {
    expect(anchorPosition(RECT, "right")).toEqual({ x: 340, y: 90 });
  });
  it("bottom is the midpoint of the bottom edge", () => {
    expect(anchorPosition(RECT, "bottom")).toEqual({ x: 220, y: 130 });
  });
  it("left is the midpoint of the left edge", () => {
    expect(anchorPosition(RECT, "left")).toEqual({ x: 100, y: 90 });
  });
});

describe("defaultSidesFor", () => {
  // A 100×50 node at the origin; B is placed at various offsets.
  const a = { x: 0, y: 0, width: 100, height: 50 };

  it("B to the right → right → left", () => {
    const b = { x: 300, y: 0, width: 100, height: 50 };
    expect(defaultSidesFor(a, b)).toEqual({ fromSide: "right", toSide: "left" });
  });
  it("B to the left → left → right", () => {
    const b = { x: -300, y: 0, width: 100, height: 50 };
    expect(defaultSidesFor(a, b)).toEqual({ fromSide: "left", toSide: "right" });
  });
  it("B above → top → bottom", () => {
    const b = { x: 0, y: -300, width: 100, height: 50 };
    expect(defaultSidesFor(a, b)).toEqual({ fromSide: "top", toSide: "bottom" });
  });
  it("B below → bottom → top", () => {
    const b = { x: 0, y: 300, width: 100, height: 50 };
    expect(defaultSidesFor(a, b)).toEqual({ fromSide: "bottom", toSide: "top" });
  });

  // Diagonals: defaultSidesFor minimizes anchor distance; for clearly
  // dominant axes, the result picks the matching cardinal pair.
  it("B north-east (dominant right) → right → left", () => {
    const b = { x: 500, y: -120, width: 100, height: 50 };
    expect(defaultSidesFor(a, b)).toEqual({ fromSide: "right", toSide: "left" });
  });
  it("B north-west (dominant left) → left → right", () => {
    const b = { x: -500, y: -120, width: 100, height: 50 };
    expect(defaultSidesFor(a, b)).toEqual({ fromSide: "left", toSide: "right" });
  });
  it("B south-east (dominant right) → right → left", () => {
    const b = { x: 500, y: 200, width: 100, height: 50 };
    expect(defaultSidesFor(a, b)).toEqual({ fromSide: "right", toSide: "left" });
  });
  it("B south-west (dominant left) → left → right", () => {
    const b = { x: -500, y: 200, width: 100, height: 50 };
    expect(defaultSidesFor(a, b)).toEqual({ fromSide: "left", toSide: "right" });
  });

  it("coincident rects (loop) → defensive right → left", () => {
    // Same rect for both endpoints — defensive case so the renderer
    // still has SOMETHING non-zero to draw.
    expect(defaultSidesFor(a, a)).toEqual({ fromSide: "right", toSide: "left" });
  });
});

describe("bezierControlPoints", () => {
  it("from 'right' pushes c1 in the +x direction", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 300, y: 0 };
    const { c1, c2 } = bezierControlPoints(from, to, "right", "left");
    expect(c1.x).toBeGreaterThan(from.x);
    expect(c2.x).toBeLessThan(to.x);
    // For a horizontal edge, y components should be unchanged.
    expect(c1.y).toBeCloseTo(from.y);
    expect(c2.y).toBeCloseTo(to.y);
  });

  it("from 'left' pushes c1 in the -x direction; from 'top' pushes c1 in the -y direction", () => {
    const { c1: c1Left } = bezierControlPoints(
      { x: 0, y: 0 },
      { x: -200, y: 0 },
      "left",
      "right",
    );
    expect(c1Left.x).toBeLessThan(0);

    const { c1: c1Top } = bezierControlPoints(
      { x: 0, y: 0 },
      { x: 0, y: -200 },
      "top",
      "bottom",
    );
    expect(c1Top.y).toBeLessThan(0);
  });

  it("from 'bottom' pushes c1 in the +y direction", () => {
    const { c1 } = bezierControlPoints(
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      "bottom",
      "top",
    );
    expect(c1.y).toBeGreaterThan(0);
  });

  it("offset is clamped to MIN for very short edges", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 0 };
    const { c1 } = bezierControlPoints(from, to, "right", "left");
    // c1.x = from.x + 1 * offset; for distance 10, raw offset = 5 < MIN,
    // so we clamp to MIN. c1.x should equal MIN.
    expect(c1.x).toBeCloseTo(EDGE_CONTROL_OFFSET_MIN);
  });

  it("offset is clamped to MAX for very long edges", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 5000, y: 0 };
    const { c1 } = bezierControlPoints(from, to, "right", "left");
    // raw offset = 2500 > MAX, so clamp to MAX.
    expect(c1.x).toBeCloseTo(EDGE_CONTROL_OFFSET_MAX);
  });
});

describe("arrowHeadPoints", () => {
  it("returns three distinct points for a non-degenerate direction", () => {
    const tip = { x: 100, y: 0 };
    const fromControl = { x: 0, y: 0 };
    const [p0, p1, p2] = arrowHeadPoints(tip, fromControl, EDGE_ARROW_SIZE);
    expect(p0).toEqual(tip);
    expect(p1).not.toEqual(p0);
    expect(p2).not.toEqual(p0);
    expect(p1).not.toEqual(p2);
  });

  it("yields a triangle with non-zero area", () => {
    const [p0, p1, p2] = arrowHeadPoints(
      { x: 100, y: 50 },
      { x: 0, y: 0 },
      EDGE_ARROW_SIZE,
    );
    // 2× the signed area; sign depends on winding but the magnitude
    // must be positive for a valid triangle.
    const twiceArea = Math.abs(
      (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y),
    );
    expect(twiceArea).toBeGreaterThan(0);
  });

  it("falls back to a finite shape when fromControl == tip (degenerate)", () => {
    const tip = { x: 100, y: 100 };
    const [p0, p1, p2] = arrowHeadPoints(tip, tip, EDGE_ARROW_SIZE);
    // The tip is still p0; the two base points must be finite numbers
    // and distinct from the tip.
    expect(p0).toEqual(tip);
    expect(Number.isFinite(p1.x) && Number.isFinite(p1.y)).toBe(true);
    expect(Number.isFinite(p2.x) && Number.isFinite(p2.y)).toBe(true);
    expect(p1).not.toEqual(p0);
    expect(p2).not.toEqual(p0);
  });
});
