// Single source of truth for resolving a node's visual style into concrete
// Konva paint values (dark-mode fix, Phase 8 — sibling subagent A).
//
// WHY: Konva paints to <canvas> and can't read CSS custom properties, so the
// renderers can't inherit the `[data-theme]` tokens. They used to hardcode
// light colors (white fill, slate border, dark text) regardless of theme,
// producing a glaring white card in dark mode. This module centralizes:
//   1. the preset-color palette (`PRESET_COLOR_MAP`) + hex resolution
//      (`resolveColor`) — ONE definition, re-exported from TextNode for the
//      existing import sites (sibling C's color picker imports it);
//   2. `resolveNodeStyle(node, theme, kind)` — turns the optional per-node
//      style fields (`backgroundColor` / `strokeColor` / `fontColor` /
//      `strokeWidth` / `strokeStyle` / `opacity` / `roundness`) into concrete
//      values, filling in THEME-AWARE defaults for anything the user left
//      unset. Every renderer (Text / File / Link / Image / Group) calls this
//      so a node looks right in both light and dark.
//
// The sibling properties panel (subagent B) writes these fields; this resolver
// reads them. Keeping the defaults here (not in the panel) means a node with
// NO style set still renders correctly — the file stays minimal.

import type { Color, PresetColor } from "../../store/nodes.js";
import type { ResolvedTheme } from "../../theme/useResolvedTheme.js";

/**
 * Preset color id ("1".."6", per plan §5) → concrete hex.
 *
 * Hues align with the Mantine / Excalidraw tier the app uses; preset "6" is
 * the Excalidraw purple `#6965db` we picked as our primary brand color (plan
 * §5b). The color picker renders swatches in this order.
 */
export const PRESET_COLOR_MAP: Record<PresetColor, string> = {
  "1": "#fa5252", // red
  "2": "#fd7e14", // orange
  "3": "#fab005", // yellow
  "4": "#40c057", // green
  "5": "#15aabf", // cyan
  "6": "#6965db", // purple — our primary
};

/**
 * Resolve a `Color` (preset id or hex literal) to a concrete hex string.
 *
 * Falls back to white (`#ffffff`) when no color is set — kept for back-compat
 * with the edge renderer + sibling C's color picker, which both call this
 * directly and expect a non-null hex. Theme-aware fallbacks live in
 * `resolveNodeStyle` (which uses the `OrUndefined` variant below so it can
 * substitute a per-theme default instead of white).
 */
export function resolveColor(c: Color | undefined): string {
  return resolveColorOrUndefined(c) ?? "#ffffff";
}

/**
 * Like `resolveColor` but returns `undefined` (not white) when no color is
 * set, so `resolveNodeStyle` can chain `?? themeDefault`.
 */
function resolveColorOrUndefined(c: Color | undefined): string | undefined {
  if (!c) return undefined;
  if (typeof c === "string" && c.startsWith("#")) return c;
  return PRESET_COLOR_MAP[c as PresetColor] ?? undefined;
}

/** The node "kinds" whose default corner radius differs (text is roomier). */
export type NodeStyleKind =
  | "text"
  | "group"
  | "file"
  | "link"
  | "image"
  // V2 drawing primitives. They use the same theme defaults; the corner-radius
  // default only matters for "shape" rectangles (round → 10), and is harmless
  // for linear/draw which don't paint a rounded body.
  | "shape"
  | "linear"
  | "draw";

/** Theme-dependent fallback palette for nodes (used when a field is unset). */
interface ThemeDefaults {
  fill: string;
  stroke: string;
  fontColor: string;
}

const THEME_DEFAULTS: Record<ResolvedTheme, ThemeDefaults> = {
  light: { fill: "#ffffff", stroke: "#cbd5e1", fontColor: "#1b1b1f" },
  dark: { fill: "#232329", stroke: "#3c3c46", fontColor: "#e3e3e8" },
};

/** Default border width when `strokeWidth` is unset. */
const DEFAULT_STROKE_WIDTH = 1.5;

/** Map a `strokeStyle` to a Konva `dash` array (undefined = solid line). */
export function strokeStyleToDash(
  style: string | undefined,
): number[] | undefined {
  switch (style) {
    case "dashed":
      return [8, 6];
    case "dotted":
      return [2, 4];
    case "solid":
    default:
      return undefined;
  }
}

/** Resolved, render-ready style values for a node. */
export interface ResolvedNodeStyle {
  /** Fill color (concrete hex). */
  fill: string;
  /** Border color (concrete hex). */
  stroke: string;
  /** Text / glyph color (concrete hex). */
  fontColor: string;
  /** Border width in canvas units. */
  strokeWidth: number;
  /** Konva dash array, or undefined for a solid line. */
  dash: number[] | undefined;
  /** Corner radius in canvas units. */
  cornerRadius: number;
  /** Opacity 0..1 (Konva scale). */
  opacity: number;
}

// Minimal shape this resolver needs — keeps it decoupled from the runtime
// node union so it works for every variant (text / group / file / link /
// image), including ones not yet in `AimapNode`.
interface StyledNode {
  color?: Color;
  backgroundColor?: Color;
  strokeColor?: Color;
  fontColor?: Color;
  strokeWidth?: number;
  strokeStyle?: string;
  opacity?: number;
  roundness?: "sharp" | "round";
}

/**
 * Resolve a node's optional style fields into concrete Konva paint values,
 * filling in theme-appropriate defaults for anything unset.
 *
 * - fill:    `backgroundColor ?? color ?? theme default`
 * - stroke:  `strokeColor ?? theme default`
 * - fontColor: `fontColor ?? theme default`
 * - strokeWidth: `strokeWidth ?? 1.5`
 * - dash:    derived from `strokeStyle` (solid->undefined, dashed->[8,6], dotted->[2,4])
 * - cornerRadius: `roundness === "sharp" ? 2 : (kind==="text" ? 12 : 10)`
 * - opacity: `(opacity ?? 100) / 100`
 */
export function resolveNodeStyle(
  node: StyledNode,
  theme: ResolvedTheme,
  kind: NodeStyleKind,
): ResolvedNodeStyle {
  const defaults = THEME_DEFAULTS[theme];

  const fill =
    resolveColorOrUndefined(node.backgroundColor) ??
    resolveColorOrUndefined(node.color) ??
    defaults.fill;
  const stroke = resolveColorOrUndefined(node.strokeColor) ?? defaults.stroke;
  const fontColor =
    resolveColorOrUndefined(node.fontColor) ?? defaults.fontColor;

  const strokeWidth = node.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  const dash = strokeStyleToDash(node.strokeStyle);

  const roundCornerRadius = kind === "text" ? 12 : 10;
  const cornerRadius = node.roundness === "sharp" ? 2 : roundCornerRadius;

  const opacity = (node.opacity ?? 100) / 100;

  return { fill, stroke, fontColor, strokeWidth, dash, cornerRadius, opacity };
}
