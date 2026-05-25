// Floating 7-swatch color picker shown on right-click of a node or edge.
//
// Phase 2 PR 3 (sibling subagent C): originally implemented for nodes only.
// Phase 3 PR 3 (this PR, also sibling C): generalized to also color edges
// by adding a `targetKind` discriminator. The picker UI is unchanged; only
// the dispatch on "pick" branches: node → `useNodes.updateNode(id, { color })`,
// edge → `useEdges.updateEdge(id, { color })`.
//
// Scope:
//   - 6 preset hues (PRESET_COLOR_MAP "1".."6") + 1 "default" swatch that
//     clears the color back to the themed fallback.
//   - Positioned at the cursor coordinates clamped to viewport bounds so
//     it never overflows offscreen.
//   - Closes on swatch click, Escape, or click-outside.
//
// State location: React-local in the parent (`NodeOverlayLayer`), no Zustand
// slice — the picker is transient UI with no persistence story.
//
// Backward compatibility: the legacy `nodeId` prop is still supported via
// a default `targetKind: "node"`. Any existing call site that only passes
// `nodeId` keeps working without changes.

import { useEffect, useRef } from "react";
import { useEdges } from "../store/edges.js";
import { useNodes } from "../store/nodes.js";
import { useHistory } from "../store/history.js";
import type { PresetColor } from "../store/nodes.js";
import { PRESET_COLOR_MAP } from "../canvas/nodes/TextNode.js";
import "./ColorPicker.css";

export type ColorTargetKind = "node" | "edge";

export interface ColorPickerProps {
  /** Id of the node or edge whose color is being edited. */
  targetId: string;
  /** Which store to dispatch the color change to. Defaults to "node" for
   *  backwards compatibility with the Phase 2 PR 3 call site. */
  targetKind?: ColorTargetKind;
  /** Screen-space pointer position where the picker should anchor. */
  x: number;
  y: number;
  /** Called when the picker should close (after pick, Esc, click-outside). */
  onClose: () => void;
}

// Order the swatches in the same sequence as the preset map (red → orange →
// yellow → green → cyan → purple). The "default" swatch is rendered first
// so a quick keyboard tab lands on the clear-color action.
const PRESETS_IN_ORDER: PresetColor[] = ["1", "2", "3", "4", "5", "6"];

// Padding kept between the picker and the viewport edge when clamping.
const VIEWPORT_MARGIN = 8;
// Approximate picker footprint for the clamp math. The actual size is set
// by CSS; this is a "good enough" upper bound — the picker stays close to
// the cursor as long as there's room, otherwise it shifts inward.
const PICKER_WIDTH = 160;
const PICKER_HEIGHT = 84;

function clampToViewport(x: number, y: number) {
  if (typeof window === "undefined") return { x, y };
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: Math.max(
      VIEWPORT_MARGIN,
      Math.min(x, w - PICKER_WIDTH - VIEWPORT_MARGIN),
    ),
    y: Math.max(
      VIEWPORT_MARGIN,
      Math.min(y, h - PICKER_HEIGHT - VIEWPORT_MARGIN),
    ),
  };
}

function applyNodeColor(nodeId: string, color: PresetColor | undefined): void {
  if (color === undefined) {
    // Clear the color by rebuilding the node without the `color` field.
    // We can't use updateNode({ color: undefined }) because the store's
    // shallow merge keeps the key with an undefined value, and
    // exactOptionalPropertyTypes forbids that on optional fields.
    // Drop the key entirely via setState.
    useNodes.setState((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const { color: _color, ...rest } = n;
        void _color;
        return rest as typeof n;
      }),
    }));
  } else {
    useNodes.getState().updateNode(nodeId, { color });
  }
}

function applyEdgeColor(edgeId: string, color: PresetColor | undefined): void {
  if (color === undefined) {
    // Same dance as node: drop the `color` key entirely.
    useEdges.setState((s) => ({
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const { color: _color, ...rest } = e;
        void _color;
        return rest as typeof e;
      }),
    }));
  } else {
    useEdges.getState().updateEdge(edgeId, { color });
  }
}

export function ColorPicker({
  targetId,
  targetKind = "node",
  x,
  y,
  onClose,
}: ColorPickerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { x: left, y: top } = clampToViewport(x, y);

  // Close on Escape + click-outside. Use mousedown (not click) so the close
  // fires before any other handler that might re-open the picker on the
  // same gesture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    // Capture-phase so we react before the underlying Konva Stage does.
    window.addEventListener("mousedown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [onClose]);

  const pick = (color: PresetColor | undefined) => {
    // Phase 4 PR 1: capture the pre-recolor doc so Cmd+Z restores the old
    // color (or clears it again). One swatch click = one undo step.
    useHistory.getState().capture();
    if (targetKind === "edge") {
      applyEdgeColor(targetId, color);
    } else {
      applyNodeColor(targetId, color);
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      className="aim-color-picker"
      style={{ left, top }}
      role="menu"
      aria-label={targetKind === "edge" ? "Edge color" : "Card color"}
      // Capture mousedown so the click-outside listener (also mousedown)
      // doesn't immediately close us when the user clicks a swatch.
      onMouseDown={(e) => e.stopPropagation()}
      // Block context menu inside the picker so a stray right-click doesn't
      // re-open another picker on top.
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="aim-color-picker__swatch aim-color-picker__swatch--default"
        title="Default (no color)"
        aria-label="Default color"
        onClick={() => pick(undefined)}
      />
      {PRESETS_IN_ORDER.map((p) => (
        <button
          key={p}
          type="button"
          className="aim-color-picker__swatch"
          style={{ background: PRESET_COLOR_MAP[p] }}
          title={`Color ${p}`}
          aria-label={`Color ${p}`}
          onClick={() => pick(p)}
        />
      ))}
    </div>
  );
}

export default ColorPicker;
