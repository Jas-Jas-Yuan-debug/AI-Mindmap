// Pure math for the dotted background grid.
//
// Kept in its own module (not in Grid.tsx) so unit tests can import it
// without dragging in react-konva → konva's node entry, which transitively
// requires the optional `canvas` native dep that isn't installed in CI.

/** Base spacing between grid dots, in canvas units, at zoom 1.0. */
export const BASE_STEP = 20;

/**
 * Pick a power-of-2 multiple of `BASE_STEP` so on-screen dot density stays
 * roughly constant across zoom levels.
 *
 *   effective_step = BASE_STEP * 2^round(log2(1 / zoom))
 *
 * At zoom = 1, the exponent rounds to 0, so step = BASE_STEP.
 * At zoom = 0.5, 1/zoom = 2, log2 = 1, step = BASE_STEP * 2.
 * At zoom = 2, 1/zoom = 0.5, log2 = -1, step = BASE_STEP / 2.
 *
 * Clamped to a minimum of 1 canvas unit so degenerate zooms can't produce a
 * zero or negative step. Non-finite / non-positive zooms fall back to
 * `BASE_STEP` so the Grid still has something sensible to draw.
 */
export function effectiveStep(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return BASE_STEP;
  const exponent = Math.round(Math.log2(1 / zoom));
  const step = BASE_STEP * Math.pow(2, exponent);
  return Math.max(1, step);
}
