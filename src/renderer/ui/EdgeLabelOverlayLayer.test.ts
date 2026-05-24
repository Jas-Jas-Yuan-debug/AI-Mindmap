// Unit test for the Bezier midpoint helper used by EdgeLabelOverlayLayer.
//
// The actual layer is React + DOM + Zustand, which is well-exercised by
// the existing jsdom-smoke test. The geometry helper itself is pure, so
// we cover it here against analytical reference points: a straight line
// (control points on the chord), and a symmetric C-curve.

import { describe, expect, it } from "vitest";
import { bezierMidpoint } from "./EdgeLabelOverlayLayer.js";

describe("bezierMidpoint", () => {
  it("returns the chord midpoint when control points lie on the chord", () => {
    // Straight line from (0,0) to (100,0). For a cubic Bezier with c1 and
    // c2 on the chord, B(0.5) = chord midpoint.
    const mid = bezierMidpoint(
      { x: 0, y: 0 },
      { x: 33, y: 0 },
      { x: 67, y: 0 },
      { x: 100, y: 0 },
    );
    expect(mid.x).toBeCloseTo(50, 6);
    expect(mid.y).toBeCloseTo(0, 6);
  });

  it("computes a symmetric arch's midpoint", () => {
    // Symmetric C-curve from (0,0) to (100,0) with control points pulled
    // straight up to y=60. B(0.5) y = 0.375*60 + 0.375*60 = 45.
    const mid = bezierMidpoint(
      { x: 0, y: 0 },
      { x: 0, y: 60 },
      { x: 100, y: 60 },
      { x: 100, y: 0 },
    );
    expect(mid.x).toBeCloseTo(50, 6);
    expect(mid.y).toBeCloseTo(45, 6);
  });

  it("is linear in each endpoint", () => {
    // Translating all four points by (dx, dy) must translate the midpoint
    // by the same amount. Property test against a fixed shape.
    const base = bezierMidpoint(
      { x: 1, y: 2 },
      { x: 3, y: 5 },
      { x: 7, y: 8 },
      { x: 9, y: 4 },
    );
    const shifted = bezierMidpoint(
      { x: 1 + 10, y: 2 - 5 },
      { x: 3 + 10, y: 5 - 5 },
      { x: 7 + 10, y: 8 - 5 },
      { x: 9 + 10, y: 4 - 5 },
    );
    expect(shifted.x).toBeCloseTo(base.x + 10, 6);
    expect(shifted.y).toBeCloseTo(base.y - 5, 6);
  });
});
