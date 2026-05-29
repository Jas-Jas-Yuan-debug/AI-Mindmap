// Konva renderer for a single DrawNode — a freehand stroke (V2).
//
// Phase 7 scope note (drawing primitives — this file):
//   This renderer handles the "draw" node kind: a variable-length polyline of
//   LOCAL coordinates captured during a freehand-draw gesture. Straight lines
//   and arrows live in LinearNode.tsx.
//
// Tension: `tension={0.4}` on the Konva <Line> gives the stroke a natural
// Catmull-Rom curve interpolation, smoothing out the raw pointer samples into
// a fluid freehand feel — the same approach Excalidraw uses for its "draw"
// tool. Setting tension to 0 renders a jagged polyline; values > 0.5 start to
// diverge from the raw path too aggressively. 0.4 is the sweet spot (matched
// against the Excalidraw reference).
//
// Drag: `useNodeDrag(node.id)` handles one-undo-step gesture, multi-selection
// group-move, and single-drop reparent — same pattern as the embed nodes.
//
// Selection ring: same bounding-box <Rect> convention as LinearNode — offset
// 4 screen-pixel-equivalent units outside (width × height). No resize handles
// in V2 (drag-only for drawing primitives, plan §7).
//
// Hex literals only (no CSS vars) — Konva renders to <canvas> and can't read
// CSS custom properties. See nodeStyle.ts for the themed palette.

import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Line, Rect } from "react-konva";
import type { DrawNode } from "../../store/nodes.js";
import { useResolvedTheme } from "../../theme/useResolvedTheme.js";
import { resolveNodeStyle } from "./nodeStyle.js";
import type { NodeStyleKind } from "./nodeStyle.js";
import { useNodeDrag } from "./useNodeDrag.js";
import { useViewport } from "../../store/viewport.js";

// --- Visual constants -------------------------------------------------------
//
// The selection ring uses the brand primary `#6965db` — hex literal required
// because Konva paints to <canvas> and can't read CSS custom properties.
// Ring offset is screen-constant (4 / zoom) so it doesn't balloon at low zoom.

const SELECTED_BORDER_COLOR = "#6965db"; // Excalidraw purple (primary)
const SELECTED_BORDER_WIDTH = 2;

export interface DrawNodeBoxProps {
  node: DrawNode;
  selected: boolean;
  /**
   * Called on pointer-down (mousedown / touchstart). Wired by Canvas.tsx
   * to drive selection. Typed against MouseEvent because Konva's prop typings
   * model `onMouseDown` as MouseEvent-only; touch input still reaches the
   * handler through Konva's pointer abstraction at runtime.
   */
  onSelect?: (e: KonvaEventObject<MouseEvent>) => void;
}

/**
 * Single Konva freehand stroke renderer. Rendered inside the Canvas content
 * Layer, one per DrawNode in `useNodes().nodes`. Drag and selection handled
 * here; no resize handles in V2 (drag-only for drawing primitives).
 */
export function DrawNodeBox({ node, selected, onSelect }: DrawNodeBoxProps) {
  // Theme-aware style. resolveNodeStyle fills in dark/light defaults for any
  // unset field so an un-styled stroke reads correctly in both themes.
  const theme = useResolvedTheme();
  // Cast required because NodeStyleKind doesn't include "draw" yet — the
  // resolver's kind param only affects cornerRadius, so the cast is safe.
  const style = resolveNodeStyle(node, theme, "draw" as NodeStyleKind);

  // Subscribe to zoom so the selection-ring offset stays a constant screen size
  // as the user zooms. Reading via useViewport keeps the dependency tight.
  const zoom = useViewport((s) => s.zoom);

  // Drag handlers from the shared hook — one undo step per gesture, multi-
  // selection group-move, single-drop reparent into group under cursor.
  const { onDragStart, onDragMove, onDragEnd } = useNodeDrag(node.id);

  // Build optional pointer-event handlers conditionally so we never pass
  // `undefined` to an optional prop under exactOptionalPropertyTypes. The
  // touch handler is cast because Konva's prop typings model it as TouchEvent
  // while onSelect is typed against MouseEvent.
  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};

  // Selection-ring geometry. The ring sits outside the node's bbox by
  // `ringOffset` canvas units — screen-constant because we divide by zoom.
  const ringOffset = 4 / zoom;

  return (
    <Group
      x={node.x}
      y={node.y}
      // `name` lets hit-test code identify draw nodes by walking the Konva
      // ancestor chain — mirrors the `name="text-node"` convention TextNode set.
      name="draw-node"
      // Stash the id so Canvas.tsx can read it off `e.target.getParent()`
      // without needing a closure over props.
      id={node.id}
      draggable
      opacity={style.opacity}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      {...pointerHandlers}
    >
      {/* Freehand stroke. tension=0.4 gives Catmull-Rom interpolation, smoothing
          the raw pointer samples into a natural curve — the same approach
          Excalidraw uses for its draw tool. strokeScaleEnabled={false} keeps the
          width visually constant at any zoom. */}
      <Line
        points={node.points}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        tension={0.4}
        lineCap="round"
        lineJoin="round"
        strokeScaleEnabled={false}
      />
      {/* Selection ring: bounding-box rect rendered outside the node's bbox.
          Screen-constant 4px gap between geometry and ring. `listening={false}`
          keeps it non-interactive so it never intercepts pointer events. */}
      {selected && (
        <Rect
          x={-ringOffset}
          y={-ringOffset}
          width={node.width + ringOffset * 2}
          height={node.height + ringOffset * 2}
          cornerRadius={4 + ringOffset}
          stroke={SELECTED_BORDER_COLOR}
          strokeWidth={SELECTED_BORDER_WIDTH}
          strokeScaleEnabled={false}
          fillEnabled={false}
          listening={false}
        />
      )}
    </Group>
  );
}

export default DrawNodeBox;
