// Pure resize math for the 8-handle resize affordance.
//
// No React, no Konva, no DOM imports — same discipline as layout.ts so the
// math can be unit-tested in isolation and the resize geometry can be reused
// later (e.g. when Phase 3 adds edges that need to snap to resized cards).
//
// The 8 handles wrap a card's bounding rect:
//
//   nw —— n —— ne
//    |          |
//    w          e
//    |          |
//   sw —— s —— se
//
// Each handle is dragged in CANVAS space (the caller converts cursor screen
// coords via screenToCanvas before calling computeResize). The math returns
// the new {width, height, x?, y?} for the underlying node.
//
// Convention:
//   - "shifting" handles (nw, n, ne, sw, w) move the node's origin (x or y)
//     in addition to changing width/height. Those return `x` and/or `y` set
//     in the result so the caller can pass them to `resizeNode(id, w, h, x?, y?)`.
//   - "anchored" handles (se, s, e) keep the origin fixed; they only change
//     width/height. The result has x/y undefined.
//
// Min-size clamping: if a drag would push width or height below `min`, we
// clamp the affected dimension to `min`. For shifting handles, x/y are
// recomputed so the OPPOSITE edge stays put — pulling the nw handle past the
// se corner shouldn't suddenly flip the rect inside out.

export type ResizeHandle =
  | "nw" | "n" | "ne"
  | "w"        | "e"
  | "sw" | "s" | "se";

/** Subset of a node's geometry used by computeResize. */
export interface ResizeNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeResult {
  width: number;
  height: number;
  /** Set only when the dragged handle shifts the origin (nw / n / ne / sw / w). */
  x?: number;
  /** Set only when the dragged handle shifts the origin (nw / n / ne / sw / w / nw). */
  y?: number;
}

/** Default minimum card size enforced during resize. */
export const DEFAULT_MIN_WIDTH = 60;
export const DEFAULT_MIN_HEIGHT = 40;

export interface ComputeResizeOpts {
  /** Minimum width permitted. Defaults to DEFAULT_MIN_WIDTH. */
  minWidth?: number;
  /** Minimum height permitted. Defaults to DEFAULT_MIN_HEIGHT. */
  minHeight?: number;
}

/**
 * Given a handle, the original node geometry, and the cursor's current
 * canvas-space position, compute the new node geometry.
 *
 * Pure function — no side effects. The caller is responsible for pushing
 * the result into the store via `useNodes.getState().resizeNode(...)`.
 *
 * Math derivation, by handle. (left/top/right/bottom refer to the original
 * node's edges in canvas space.)
 *
 *   left   = node.x
 *   top    = node.y
 *   right  = node.x + node.width
 *   bottom = node.y + node.height
 *
 *   nw: newX = cursor.x; newY = cursor.y;
 *       newW = right - newX; newH = bottom - newY
 *   n:  newY = cursor.y; newH = bottom - newY  (x, width unchanged)
 *   ne: newY = cursor.y; newW = cursor.x - left; newH = bottom - newY
 *   w:  newX = cursor.x; newW = right - newX    (y, height unchanged)
 *   e:  newW = cursor.x - left                  (x, y, height unchanged)
 *   sw: newX = cursor.x; newW = right - newX; newH = cursor.y - top
 *   s:  newH = cursor.y - top                   (x, y, width unchanged)
 *   se: newW = cursor.x - left; newH = cursor.y - top
 *
 * Min-size clamping: if newW < minWidth, clamp it to minWidth and back-
 * propagate to x for shifting handles (newX = right - minWidth) so the
 * fixed edge stays put. Same for height with the bottom edge.
 */
export function computeResize(
  handle: ResizeHandle,
  node: ResizeNode,
  cursor: { x: number; y: number },
  opts: ComputeResizeOpts = {},
): ResizeResult {
  const minW = opts.minWidth ?? DEFAULT_MIN_WIDTH;
  const minH = opts.minHeight ?? DEFAULT_MIN_HEIGHT;

  const left = node.x;
  const top = node.y;
  const right = node.x + node.width;
  const bottom = node.y + node.height;

  // Whether this handle moves the x origin / y origin.
  const shiftsX = handle === "nw" || handle === "w" || handle === "sw";
  const shiftsY = handle === "nw" || handle === "n" || handle === "ne";

  // Tentative new values, before clamping.
  let newX = node.x;
  let newY = node.y;
  let newW = node.width;
  let newH = node.height;

  if (shiftsX) {
    newX = cursor.x;
    newW = right - cursor.x;
  } else if (handle === "ne" || handle === "e" || handle === "se") {
    newW = cursor.x - left;
  }

  if (shiftsY) {
    newY = cursor.y;
    newH = bottom - cursor.y;
  } else if (handle === "sw" || handle === "s" || handle === "se") {
    newH = cursor.y - top;
  }

  // Clamp width. For shifting handles, re-derive x so the opposite (right)
  // edge stays put when the user pulls the handle past the minimum.
  if (newW < minW) {
    newW = minW;
    if (shiftsX) newX = right - minW;
  }
  // Same for height with the bottom edge.
  if (newH < minH) {
    newH = minH;
    if (shiftsY) newY = bottom - minH;
  }

  const result: ResizeResult = { width: newW, height: newH };
  if (shiftsX) result.x = newX;
  if (shiftsY) result.y = newY;
  return result;
}

/**
 * The 8 handle ids, in canonical clockwise-from-top-left order. Exported so
 * the renderer can iterate without re-spelling the union.
 */
export const RESIZE_HANDLES: ReadonlyArray<ResizeHandle> = [
  "nw", "n", "ne", "e", "se", "s", "sw", "w",
];

/**
 * For a handle on a node of size (width, height), return its position in
 * node-local coordinates (i.e. relative to the node's top-left). Handle
 * size is the caller's concern.
 */
export function handlePosition(
  handle: ResizeHandle,
  width: number,
  height: number,
): { x: number; y: number } {
  const cx = width / 2;
  const cy = height / 2;
  switch (handle) {
    case "nw": return { x: 0, y: 0 };
    case "n":  return { x: cx, y: 0 };
    case "ne": return { x: width, y: 0 };
    case "e":  return { x: width, y: cy };
    case "se": return { x: width, y: height };
    case "s":  return { x: cx, y: height };
    case "sw": return { x: 0, y: height };
    case "w":  return { x: 0, y: cy };
  }
}

/**
 * CSS cursor string appropriate for each handle. Konva accepts the same
 * standard cursors via `container.style.cursor`.
 */
export function handleCursor(handle: ResizeHandle): string {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
  }
}
