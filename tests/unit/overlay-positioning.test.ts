// Unit tests for the screen-positioning math used by the HTML node-overlay
// layer (Phase 2 PR 3 — edit-mode + markdown + color picker).
//
// The overlay computes its DOM rect from the node's canvas-space (x, y,
// width, height) under the current viewport. The math itself is the
// `canvasToScreen` helper from `src/renderer/canvas/layout.ts`; this file
// pins down the contract the overlay relies on:
//
//   left   = node.x   * zoom + viewport.x
//   top    = node.y   * zoom + viewport.y
//   width  = node.width  * zoom
//   height = node.height * zoom
//
// Pure math. No React, no DOM — but the file lives under src/renderer/ so
// vitest's environmentMatchGlobs sends it to jsdom (harmless).

import { describe, expect, test } from "vitest";
import {
  canvasToScreen,
  type Viewport,
} from "../../src/renderer/canvas/layout.js";

/**
 * Compute the overlay's screen-space rect for a node under a given viewport.
 *
 * This is the same calculation the NodeOverlayLayer performs at render time;
 * extracting it as a pure helper lets us assert the contract independently
 * of React/Konva. The implementation is intentionally identical to the
 * inline math in `NodeOverlayLayer.tsx`.
 */
function overlayRectForNode(
  node: { x: number; y: number; width: number; height: number },
  v: Viewport,
): { left: number; top: number; width: number; height: number } {
  const topLeft = canvasToScreen({ x: node.x, y: node.y }, v);
  const bottomRight = canvasToScreen(
    { x: node.x + node.width, y: node.y + node.height },
    v,
  );
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

describe("overlay positioning", () => {
  test("identity viewport: rect matches the node's canvas-space rect", () => {
    const rect = overlayRectForNode(
      { x: 100, y: 50, width: 240, height: 80 },
      { x: 0, y: 0, zoom: 1 },
    );
    expect(rect).toEqual({ left: 100, top: 50, width: 240, height: 80 });
  });

  test("zoom 2x doubles every dimension and offset", () => {
    const rect = overlayRectForNode(
      { x: 100, y: 50, width: 240, height: 80 },
      { x: 0, y: 0, zoom: 2 },
    );
    expect(rect).toEqual({ left: 200, top: 100, width: 480, height: 160 });
  });

  test("zoom 0.5x halves every dimension and offset", () => {
    const rect = overlayRectForNode(
      { x: 100, y: 50, width: 240, height: 80 },
      { x: 0, y: 0, zoom: 0.5 },
    );
    expect(rect).toEqual({ left: 50, top: 25, width: 120, height: 40 });
  });

  test("pan offsets shift left/top but leave width/height untouched", () => {
    const rect = overlayRectForNode(
      { x: 100, y: 50, width: 240, height: 80 },
      { x: 30, y: -20, zoom: 1 },
    );
    expect(rect).toEqual({ left: 130, top: 30, width: 240, height: 80 });
  });

  test("combined pan + zoom: width/height scaled, left/top scaled then translated", () => {
    const rect = overlayRectForNode(
      { x: 100, y: 50, width: 240, height: 80 },
      { x: 30, y: -20, zoom: 2 },
    );
    // left = 100 * 2 + 30 = 230, top = 50 * 2 + -20 = 80
    // width = 240 * 2 = 480, height = 80 * 2 = 160
    expect(rect).toEqual({ left: 230, top: 80, width: 480, height: 160 });
  });

  test("negative node coordinates work (canvas extends in all directions)", () => {
    const rect = overlayRectForNode(
      { x: -50, y: -100, width: 200, height: 80 },
      { x: 0, y: 0, zoom: 1 },
    );
    expect(rect).toEqual({ left: -50, top: -100, width: 200, height: 80 });
  });

  test("width/height stay >= 0 under any viewport (positive-dim invariant)", () => {
    // Sanity: as long as node.width and node.height are positive and zoom is
    // positive (clamped to [ZOOM_MIN, ZOOM_MAX]), the resulting overlay
    // width/height stays positive.
    const viewports: Viewport[] = [
      { x: 0, y: 0, zoom: 1 },
      { x: 1000, y: 1000, zoom: 0.1 },
      { x: -500, y: -500, zoom: 4 },
    ];
    for (const v of viewports) {
      const rect = overlayRectForNode(
        { x: 10, y: 20, width: 240, height: 80 },
        v,
      );
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });
});
