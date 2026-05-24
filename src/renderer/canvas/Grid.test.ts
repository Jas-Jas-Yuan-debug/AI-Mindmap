// Unit tests for the Grid's adaptive-step helper.
//
// The Grid component itself is a thin React/Konva shell around `effectiveStep`
// — that's where the only non-trivial logic lives. Locking it in here so
// future zoom-range tweaks don't accidentally regress visual density.
//
// We import from grid-math.ts (not Grid.tsx) to keep this test free of the
// react-konva dependency chain (which transitively requires the optional
// `canvas` native module under Node).

import { describe, expect, test } from "vitest";
import { effectiveStep, BASE_STEP } from "./grid-math.js";

describe("effectiveStep", () => {
  test("at zoom 1.0 the step equals the base step", () => {
    expect(effectiveStep(1)).toBe(BASE_STEP);
    expect(BASE_STEP).toBe(20);
  });

  test("zooming out (smaller zoom) increases the step", () => {
    // 1/0.5 = 2, log2(2) = 1, step = 20 * 2 = 40
    expect(effectiveStep(0.5)).toBe(40);
    // 1/0.25 = 4, log2(4) = 2, step = 20 * 4 = 80
    expect(effectiveStep(0.25)).toBe(80);
    // 1/0.1 = 10, log2(10) ≈ 3.32, rounds to 3, step = 20 * 8 = 160
    expect(effectiveStep(0.1)).toBe(160);
  });

  test("zooming in (larger zoom) decreases the step", () => {
    // 1/2 = 0.5, log2(0.5) = -1, step = 20 / 2 = 10
    expect(effectiveStep(2)).toBe(10);
    // 1/4 = 0.25, log2(0.25) = -2, step = 20 / 4 = 5
    expect(effectiveStep(4)).toBe(5);
  });

  test("step is always positive (never zero / negative)", () => {
    expect(effectiveStep(0.001)).toBeGreaterThan(0);
    expect(effectiveStep(1000)).toBeGreaterThan(0);
  });

  test("non-finite and non-positive zooms fall back to BASE_STEP", () => {
    expect(effectiveStep(Number.NaN)).toBe(BASE_STEP);
    expect(effectiveStep(Number.POSITIVE_INFINITY)).toBe(BASE_STEP);
    expect(effectiveStep(0)).toBe(BASE_STEP);
    expect(effectiveStep(-1)).toBe(BASE_STEP);
  });

  test("step is a power-of-2 multiple of the base step", () => {
    const zooms = [0.1, 0.2, 0.5, 0.8, 1, 1.5, 2, 3, 4];
    for (const z of zooms) {
      const step = effectiveStep(z);
      const ratio = step / BASE_STEP;
      const log = Math.log2(ratio);
      expect(Math.abs(log - Math.round(log))).toBeLessThan(1e-9);
    }
  });
});
