// Unit tests for the pure viewport-math module.
//
// These tests cover the contract every other piece of the canvas depends on:
//   - zoom clamping respects ZOOM_MIN / ZOOM_MAX
//   - screen <-> canvas conversions are inverses
//   - `zoomAroundPoint` preserves the screen-anchor invariant
//
// Pure math; no DOM or Konva needed. Lives under src/renderer/ so it sits
// next to the code it covers; vitest's environmentMatchGlobs sends this to
// jsdom, which is harmless for number crunching.

import { describe, expect, test } from "vitest";
import {
  canvasToScreen,
  clampZoom,
  screenToCanvas,
  zoomAroundPoint,
  ZOOM_MAX,
  ZOOM_MIN,
  type Viewport,
} from "./layout.js";

const IDENTITY: Viewport = { x: 0, y: 0, zoom: 1 };

describe("clampZoom", () => {
  test("returns value unchanged when inside [ZOOM_MIN, ZOOM_MAX]", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  test("passes through the exact bounds", () => {
    expect(clampZoom(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX);
  });

  test("clamps values below ZOOM_MIN up to ZOOM_MIN", () => {
    expect(clampZoom(0.05)).toBe(ZOOM_MIN);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(-3)).toBe(ZOOM_MIN);
  });

  test("clamps values above ZOOM_MAX down to ZOOM_MAX", () => {
    expect(clampZoom(10)).toBe(ZOOM_MAX);
    expect(clampZoom(4.0001)).toBe(ZOOM_MAX);
  });

  test("collapses non-finite inputs to 1 (safe default)", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe("screenToCanvas / canvasToScreen", () => {
  test("at the identity viewport, screen and canvas coords match", () => {
    expect(screenToCanvas({ x: 100, y: 50 }, IDENTITY)).toEqual({ x: 100, y: 50 });
    expect(canvasToScreen({ x: 100, y: 50 }, IDENTITY)).toEqual({ x: 100, y: 50 });
  });

  test("translation: pan offsets shift the origin in screen space", () => {
    const v: Viewport = { x: 200, y: -50, zoom: 1 };
    // The canvas origin (0,0) renders at (v.x, v.y) on screen.
    expect(canvasToScreen({ x: 0, y: 0 }, v)).toEqual({ x: 200, y: -50 });
    // And the inverse: the screen point (v.x, v.y) maps back to canvas origin.
    expect(screenToCanvas({ x: 200, y: -50 }, v)).toEqual({ x: 0, y: 0 });
  });

  test("scale: zoom multiplies canvas-space distances on screen", () => {
    const v: Viewport = { x: 0, y: 0, zoom: 2 };
    expect(canvasToScreen({ x: 10, y: 20 }, v)).toEqual({ x: 20, y: 40 });
    expect(screenToCanvas({ x: 20, y: 40 }, v)).toEqual({ x: 10, y: 20 });
  });

  test("round-trip: canvas -> screen -> canvas across several viewports", () => {
    const viewports: Viewport[] = [
      IDENTITY,
      { x: 0, y: 0, zoom: 0.5 },
      { x: 0, y: 0, zoom: 3 },
      { x: 100, y: -200, zoom: 1 },
      { x: -33.5, y: 77.25, zoom: 1.75 },
      { x: 1024, y: 768, zoom: 0.1 },
    ];
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: -1 },
      { x: 250, y: 500 },
      { x: -1000, y: -1000 },
      { x: 12.5, y: -7.125 },
    ];
    for (const v of viewports) {
      for (const p of points) {
        const screen = canvasToScreen(p, v);
        const back = screenToCanvas(screen, v);
        expect(back.x).toBeCloseTo(p.x, 10);
        expect(back.y).toBeCloseTo(p.y, 10);
      }
    }
  });

  test("round-trip: screen -> canvas -> screen across several viewports", () => {
    const v: Viewport = { x: -42, y: 18, zoom: 1.3 };
    const screens = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: -250.75, y: 800.25 },
    ];
    for (const s of screens) {
      const canvas = screenToCanvas(s, v);
      const back = canvasToScreen(canvas, v);
      expect(back.x).toBeCloseTo(s.x, 10);
      expect(back.y).toBeCloseTo(s.y, 10);
    }
  });
});

describe("zoomAroundPoint", () => {
  test("invariant: the screen anchor maps to the same canvas point before and after", () => {
    const cases: Array<{ v: Viewport; anchor: { x: number; y: number }; newZoom: number }> = [
      { v: IDENTITY, anchor: { x: 400, y: 300 }, newZoom: 2 },
      { v: IDENTITY, anchor: { x: 400, y: 300 }, newZoom: 0.5 },
      { v: { x: 50, y: -75, zoom: 1.25 }, anchor: { x: 200, y: 200 }, newZoom: 3 },
      { v: { x: 50, y: -75, zoom: 1.25 }, anchor: { x: 200, y: 200 }, newZoom: 0.4 },
      { v: { x: -200, y: 400, zoom: 0.8 }, anchor: { x: 0, y: 0 }, newZoom: 1.6 },
    ];
    for (const c of cases) {
      const canvasBefore = screenToCanvas(c.anchor, c.v);
      const next = zoomAroundPoint(c.v, c.anchor, c.newZoom);
      const canvasAfter = screenToCanvas(c.anchor, next);
      expect(canvasAfter.x).toBeCloseTo(canvasBefore.x, 10);
      expect(canvasAfter.y).toBeCloseTo(canvasBefore.y, 10);
      // And the new zoom is what we asked for (assuming we stayed in range).
      expect(next.zoom).toBeCloseTo(c.newZoom, 10);
    }
  });

  test("clamps requested zoom; the anchor invariant still holds for the clamped value", () => {
    const v: Viewport = { x: 100, y: 100, zoom: 1 };
    const anchor = { x: 500, y: 400 };

    const tooHigh = zoomAroundPoint(v, anchor, 99);
    expect(tooHigh.zoom).toBe(ZOOM_MAX);
    expect(screenToCanvas(anchor, tooHigh)).toEqual(screenToCanvas(anchor, v));

    const tooLow = zoomAroundPoint(v, anchor, 0.0001);
    expect(tooLow.zoom).toBe(ZOOM_MIN);
    expect(screenToCanvas(anchor, tooLow)).toEqual(screenToCanvas(anchor, v));
  });

  test("zooming to the same factor is a no-op when anchor and pan agree", () => {
    const v: Viewport = { x: 30, y: 60, zoom: 1.5 };
    const anchor = { x: 100, y: 200 };
    const next = zoomAroundPoint(v, anchor, 1.5);
    expect(next.zoom).toBe(1.5);
    expect(next.x).toBeCloseTo(v.x, 10);
    expect(next.y).toBeCloseTo(v.y, 10);
  });

  test("zooming around the screen origin keeps the canvas origin pinned only when pan is zero", () => {
    // Sanity: with pan = 0, zooming around (0,0) leaves pan = 0.
    const next = zoomAroundPoint(IDENTITY, { x: 0, y: 0 }, 2);
    expect(next).toEqual({ x: 0, y: 0, zoom: 2 });
  });
});
