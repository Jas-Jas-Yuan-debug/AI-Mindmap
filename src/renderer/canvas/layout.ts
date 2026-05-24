// Pure coordinate-math utilities for the infinite canvas.
//
// No React, no Konva, no DOM imports. This module is the single source of
// truth for screen <-> canvas conversions and viewport math so the rest of
// the renderer (and tests) can reason about positions consistently.
//
// Constants ZOOM_MIN / ZOOM_MAX live here (the pure module) and are
// re-exported from store/viewport.ts to avoid double-definitions.

/** Inclusive lower bound for viewport zoom factor. */
export const ZOOM_MIN = 0.1;

/** Inclusive upper bound for viewport zoom factor. */
export const ZOOM_MAX = 4.0;

/**
 * Viewport state expressed as a screen-space translation + scale.
 *
 * Mapping convention: a canvas-space point P is drawn at screen position
 *   S = P * zoom + (x, y)
 * Equivalently, the inverse mapping is
 *   P = (S - (x, y)) / zoom
 *
 * `x` / `y` are screen-pixel offsets (the Konva Stage's `x` / `y` props),
 * NOT canvas-space pan distances. This matches what we pass straight into
 * <Stage x={...} y={...} scaleX={zoom} scaleY={zoom} />.
 */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** A 2D point in either screen or canvas space. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Clamp a zoom value to [ZOOM_MIN, ZOOM_MAX]. Non-finite inputs (NaN, +/-Inf)
 * collapse to 1.0 so we never store an unusable zoom in the viewport store.
 */
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  if (z < ZOOM_MIN) return ZOOM_MIN;
  if (z > ZOOM_MAX) return ZOOM_MAX;
  return z;
}

/**
 * Convert a screen-space point (e.g. cursor position relative to the Stage
 * container's top-left) into the infinite canvas's coordinate space.
 *
 *   canvas = (screen - (v.x, v.y)) / v.zoom
 */
export function screenToCanvas(screen: Point, v: Viewport): Point {
  return {
    x: (screen.x - v.x) / v.zoom,
    y: (screen.y - v.y) / v.zoom,
  };
}

/**
 * Inverse of `screenToCanvas`: convert a canvas-space point to the screen-
 * space pixel where Konva will render it under the given viewport.
 *
 *   screen = canvas * v.zoom + (v.x, v.y)
 */
export function canvasToScreen(canvas: Point, v: Viewport): Point {
  return {
    x: canvas.x * v.zoom + v.x,
    y: canvas.y * v.zoom + v.y,
  };
}

/**
 * Compute the new viewport produced by zooming to `newZoom` while keeping
 * the point under `screenAnchor` (screen-space, e.g. cursor position)
 * pinned to the same canvas-space point.
 *
 * Derivation:
 *   canvasAnchor = (screenAnchor - oldPan) / oldZoom
 *   We want: screenAnchor = canvasAnchor * newZoom + newPan
 *   => newPan = screenAnchor - canvasAnchor * newZoom
 *
 * `newZoom` is clamped to [ZOOM_MIN, ZOOM_MAX] before the new pan is
 * solved; if clamping changes the value, the anchor invariant still holds
 * exactly for the clamped zoom.
 */
export function zoomAroundPoint(
  v: Viewport,
  screenAnchor: Point,
  newZoom: number,
): Viewport {
  const clamped = clampZoom(newZoom);
  const canvasAnchor = screenToCanvas(screenAnchor, v);
  return {
    zoom: clamped,
    x: screenAnchor.x - canvasAnchor.x * clamped,
    y: screenAnchor.y - canvasAnchor.y * clamped,
  };
}
