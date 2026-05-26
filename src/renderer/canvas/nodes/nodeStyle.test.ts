// Unit tests for the dark-mode style resolver (sibling subagent A).
//
// resolveNodeStyle is the single place that turns a node's OPTIONAL style
// fields into concrete Konva paint values, filling in theme-appropriate
// defaults. These tests pin: (1) the light/dark defaults when nothing is set,
// (2) that each per-node field overrides its default, (3) opacity scaling, and
// (4) the strokeStyle -> dash mapping + resolveColor preset/hex/fallback.

import { describe, expect, test } from "vitest";
import {
  PRESET_COLOR_MAP,
  resolveColor,
  resolveNodeStyle,
  strokeStyleToDash,
} from "./nodeStyle.js";

describe("resolveColor", () => {
  test("returns the hex literal unchanged", () => {
    expect(resolveColor("#abcdef")).toBe("#abcdef");
  });
  test("maps a preset id to its hex", () => {
    expect(resolveColor("6")).toBe(PRESET_COLOR_MAP["6"]);
    expect(resolveColor("1")).toBe("#fa5252");
  });
  test("falls back to white when unset (back-compat with edge renderer)", () => {
    expect(resolveColor(undefined)).toBe("#ffffff");
  });
});

describe("strokeStyleToDash", () => {
  test("solid / unset -> undefined (a continuous line)", () => {
    expect(strokeStyleToDash("solid")).toBeUndefined();
    expect(strokeStyleToDash(undefined)).toBeUndefined();
  });
  test("dashed -> [8, 6]", () => {
    expect(strokeStyleToDash("dashed")).toEqual([8, 6]);
  });
  test("dotted -> [2, 4]", () => {
    expect(strokeStyleToDash("dotted")).toEqual([2, 4]);
  });
});

describe("resolveNodeStyle — theme defaults (no style set)", () => {
  test("light theme defaults", () => {
    const s = resolveNodeStyle({}, "light", "text");
    expect(s.fill).toBe("#ffffff");
    expect(s.stroke).toBe("#cbd5e1");
    expect(s.fontColor).toBe("#1b1b1f");
    expect(s.strokeWidth).toBe(1.5);
    expect(s.dash).toBeUndefined();
    expect(s.cornerRadius).toBe(12); // text default
    expect(s.opacity).toBe(1);
  });

  test("dark theme defaults — no glaring white card", () => {
    const s = resolveNodeStyle({}, "dark", "text");
    expect(s.fill).toBe("#232329");
    expect(s.stroke).toBe("#3c3c46");
    expect(s.fontColor).toBe("#e3e3e8");
    expect(s.fill).not.toBe("#ffffff");
  });

  test("non-text kinds use a 10px round corner by default", () => {
    expect(resolveNodeStyle({}, "light", "group").cornerRadius).toBe(10);
    expect(resolveNodeStyle({}, "light", "file").cornerRadius).toBe(10);
    expect(resolveNodeStyle({}, "light", "image").cornerRadius).toBe(10);
  });
});

describe("resolveNodeStyle — per-field overrides", () => {
  test("backgroundColor overrides the theme fill default", () => {
    const s = resolveNodeStyle({ backgroundColor: "4" }, "dark", "text");
    expect(s.fill).toBe(PRESET_COLOR_MAP["4"]);
  });

  test("legacy `color` is used as fill when backgroundColor is unset", () => {
    const s = resolveNodeStyle({ color: "#123456" }, "dark", "text");
    expect(s.fill).toBe("#123456");
  });

  test("backgroundColor wins over legacy color", () => {
    const s = resolveNodeStyle(
      { backgroundColor: "#aaaaaa", color: "#bbbbbb" },
      "light",
      "text",
    );
    expect(s.fill).toBe("#aaaaaa");
  });

  test("strokeColor / fontColor override their theme defaults", () => {
    const s = resolveNodeStyle(
      { strokeColor: "#ff0000", fontColor: "2" },
      "dark",
      "text",
    );
    expect(s.stroke).toBe("#ff0000");
    expect(s.fontColor).toBe(PRESET_COLOR_MAP["2"]);
  });

  test("strokeWidth tier overrides the 1.5 default", () => {
    expect(resolveNodeStyle({ strokeWidth: 4 }, "light", "text").strokeWidth).toBe(
      4,
    );
  });

  test("strokeStyle drives the dash array", () => {
    expect(
      resolveNodeStyle({ strokeStyle: "dashed" }, "light", "text").dash,
    ).toEqual([8, 6]);
    expect(
      resolveNodeStyle({ strokeStyle: "dotted" }, "light", "text").dash,
    ).toEqual([2, 4]);
  });

  test("roundness: sharp -> 2, round -> kind default", () => {
    expect(
      resolveNodeStyle({ roundness: "sharp" }, "light", "text").cornerRadius,
    ).toBe(2);
    expect(
      resolveNodeStyle({ roundness: "round" }, "light", "group").cornerRadius,
    ).toBe(10);
  });
});

describe("resolveNodeStyle — opacity", () => {
  test("opacity 100 (or unset) -> 1", () => {
    expect(resolveNodeStyle({}, "light", "text").opacity).toBe(1);
    expect(resolveNodeStyle({ opacity: 100 }, "light", "text").opacity).toBe(1);
  });
  test("opacity 0 -> 0", () => {
    expect(resolveNodeStyle({ opacity: 0 }, "light", "text").opacity).toBe(0);
  });
  test("opacity 50 -> 0.5", () => {
    expect(resolveNodeStyle({ opacity: 50 }, "light", "text").opacity).toBe(0.5);
  });
});
