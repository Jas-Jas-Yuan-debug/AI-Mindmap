// Unit tests for the pure resize math.
//
// Cursor positions are expressed in canvas space. The caller (TextNode.tsx)
// converts screen → canvas via screenToCanvas before invoking computeResize.

import { describe, expect, test } from "vitest";
import {
  computeResize,
  DEFAULT_MIN_HEIGHT,
  DEFAULT_MIN_WIDTH,
  handleCursor,
  handlePosition,
  RESIZE_HANDLES,
  type ResizeNode,
} from "./resize.js";

const makeNode = (overrides: Partial<ResizeNode> = {}): ResizeNode => ({
  x: overrides.x ?? 100,
  y: overrides.y ?? 200,
  width: overrides.width ?? 300,
  height: overrides.height ?? 150,
});

describe("computeResize — corner handles (shift both axes)", () => {
  test("nw: drag origin moves x AND y, width/height shrink", () => {
    const n = makeNode(); // x=100 y=200 w=300 h=150 → right=400 bottom=350
    const out = computeResize("nw", n, { x: 150, y: 230 });
    expect(out).toEqual({ x: 150, y: 230, width: 250, height: 120 });
  });

  test("ne: y shifts (top edge moves), x stays; width grows out the right", () => {
    const n = makeNode();
    const out = computeResize("ne", n, { x: 500, y: 230 });
    // x stays at 100; y becomes 230; width = 500 - 100 = 400; height = 350 - 230 = 120
    expect(out.x).toBeUndefined();
    expect(out.y).toBe(230);
    expect(out.width).toBe(400);
    expect(out.height).toBe(120);
  });

  test("sw: x shifts, y stays; height grows downward", () => {
    const n = makeNode();
    const out = computeResize("sw", n, { x: 150, y: 400 });
    // x = 150; width = 400 - 150 = 250; y unchanged; height = 400 - 200 = 200
    expect(out.x).toBe(150);
    expect(out.y).toBeUndefined();
    expect(out.width).toBe(250);
    expect(out.height).toBe(200);
  });

  test("se: neither axis shifts; only width + height grow", () => {
    const n = makeNode();
    const out = computeResize("se", n, { x: 500, y: 400 });
    expect(out.x).toBeUndefined();
    expect(out.y).toBeUndefined();
    expect(out.width).toBe(400);
    expect(out.height).toBe(200);
  });
});

describe("computeResize — edge handles (single axis)", () => {
  test("n: only y + height change, x + width untouched", () => {
    const n = makeNode();
    const out = computeResize("n", n, { x: 999, y: 230 });
    expect(out.x).toBeUndefined();
    expect(out.y).toBe(230);
    expect(out.width).toBe(300);
    expect(out.height).toBe(120);
  });

  test("s: only height changes, origin untouched", () => {
    const n = makeNode();
    const out = computeResize("s", n, { x: 999, y: 400 });
    expect(out.x).toBeUndefined();
    expect(out.y).toBeUndefined();
    expect(out.width).toBe(300);
    expect(out.height).toBe(200);
  });

  test("e: only width changes", () => {
    const n = makeNode();
    const out = computeResize("e", n, { x: 500, y: 999 });
    expect(out.x).toBeUndefined();
    expect(out.y).toBeUndefined();
    expect(out.width).toBe(400);
    expect(out.height).toBe(150);
  });

  test("w: x + width change, y + height untouched", () => {
    const n = makeNode();
    const out = computeResize("w", n, { x: 150, y: 999 });
    expect(out.x).toBe(150);
    expect(out.y).toBeUndefined();
    expect(out.width).toBe(250);
    expect(out.height).toBe(150);
  });
});

describe("computeResize — min-size clamping", () => {
  test("se past minimum clamps to defaults without flipping", () => {
    const n = makeNode();
    // Cursor pulled into negative quadrant relative to node origin → would
    // make width/height negative if unclamped.
    const out = computeResize("se", n, { x: 0, y: 0 });
    expect(out.width).toBe(DEFAULT_MIN_WIDTH);
    expect(out.height).toBe(DEFAULT_MIN_HEIGHT);
  });

  test("nw clamp keeps the SE corner pinned (back-propagates x/y)", () => {
    const n = makeNode(); // right=400, bottom=350
    // Cursor far past the SE corner — without clamping x would shoot past
    // right edge and width would go negative.
    const out = computeResize("nw", n, { x: 9999, y: 9999 });
    expect(out.width).toBe(DEFAULT_MIN_WIDTH);
    expect(out.height).toBe(DEFAULT_MIN_HEIGHT);
    // Right edge preserved: x + width === original right (400).
    expect(out.x).toBe(400 - DEFAULT_MIN_WIDTH);
    // Bottom edge preserved: y + height === original bottom (350).
    expect(out.y).toBe(350 - DEFAULT_MIN_HEIGHT);
  });

  test("w clamp pins the east edge, leaves y/height untouched", () => {
    const n = makeNode();
    const out = computeResize("w", n, { x: 9999, y: 0 });
    expect(out.width).toBe(DEFAULT_MIN_WIDTH);
    expect(out.x).toBe(400 - DEFAULT_MIN_WIDTH);
    expect(out.y).toBeUndefined();
    expect(out.height).toBe(150);
  });

  test("custom min size honored over defaults", () => {
    const n = makeNode();
    const out = computeResize(
      "se",
      n,
      { x: 0, y: 0 },
      { minWidth: 120, minHeight: 80 },
    );
    expect(out.width).toBe(120);
    expect(out.height).toBe(80);
  });
});

describe("RESIZE_HANDLES + handlePosition + handleCursor", () => {
  test("RESIZE_HANDLES enumerates all 8 handles exactly once", () => {
    expect(RESIZE_HANDLES.length).toBe(8);
    expect(new Set(RESIZE_HANDLES).size).toBe(8);
  });

  test("handlePosition places corners at exact rect corners", () => {
    expect(handlePosition("nw", 300, 150)).toEqual({ x: 0, y: 0 });
    expect(handlePosition("ne", 300, 150)).toEqual({ x: 300, y: 0 });
    expect(handlePosition("sw", 300, 150)).toEqual({ x: 0, y: 150 });
    expect(handlePosition("se", 300, 150)).toEqual({ x: 300, y: 150 });
  });

  test("handlePosition places edges at midpoints", () => {
    expect(handlePosition("n", 300, 150)).toEqual({ x: 150, y: 0 });
    expect(handlePosition("s", 300, 150)).toEqual({ x: 150, y: 150 });
    expect(handlePosition("e", 300, 150)).toEqual({ x: 300, y: 75 });
    expect(handlePosition("w", 300, 150)).toEqual({ x: 0, y: 75 });
  });

  test("handleCursor returns a non-empty resize cursor for every handle", () => {
    for (const h of RESIZE_HANDLES) {
      expect(handleCursor(h)).toMatch(/-resize$/);
    }
  });
});
