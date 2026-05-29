// Konva renderer for a single LinearNode — a straight line or arrow (V2).
//
// Phase 7 scope note (drawing primitives — this file):
//   This renderer handles the "linear" node kind, which covers both plain
//   straight lines and single-headed arrows. The distinction is driven by
//   `node.linear` ("line" | "arrow"). Freehand strokes live in DrawNode.tsx.
//
// Drag: Konva's built-in `draggable` on the Group drives the visual move;
// `useNodeDrag(node.id)` mirrors it into the store on every tick and handles
// multi-selection group-move + single-drop reparent — same pattern as the
// embed nodes (Phase 7).
//
// Selection ring: a bounding-box <Rect> offset 4 screen-pixel-equivalent units
// outside the node's (width × height) bbox. No resize handles in V2 — drag
// only (plan §7 drawing primitives scope).
//
// Arrow pointerLength / pointerWidth: fixed at 10 canvas units so the arrowhead
// reads at any zoom. `strokeScaleEnabled={false}` keeps the stroke visually
// constant as the user zooms — matches the Origin marker + rest of the chrome.
//
// Hex literals only (no CSS vars) — Konva renders to <canvas> and can't read
// CSS custom properties. See nodeStyle.ts for the themed palette.

import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Arrow, Line, Rect } from "react-konva";
import type { LinearNode } from "../../store/nodes.js";
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
const ARROWHEAD_SIZE = 10; // canvas units; constant regardless of zoom

export interface LinearNodeBoxProps {
  node: LinearNode;
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
 * Single Konva line / arrow renderer. Rendered inside the Canvas content Layer,
 * one per LinearNode in `useNodes().nodes`. Drag and selection handled here;
 * no resize handles in V2 (drag-only for drawing primitives).
 */
export function LinearNodeBox({ node, selected, onSelect }: LinearNodeBoxProps) {
  // Theme-aware style. resolveNodeStyle fills in dark/light defaults for any
  // unset field so an un-styled line reads correctly in both themes.
  const theme = useResolvedTheme();
  // Cast required because NodeStyleKind doesn't include "linear" yet — the
  // resolver's kind param only affects cornerRadius, so the cast is safe.
  const style = resolveNodeStyle(node, theme, "linear" as NodeStyleKind);

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
      // `name` lets hit-test code identify linear nodes by walking the Konva
      // ancestor chain — mirrors the `name="text-node"` convention TextNode set.
      name="linear-node"
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
      {/* Line or arrow body — only one renders, chosen by node.linear. */}
      {node.linear === "arrow" ? (
        <Arrow
          points={node.points}
          stroke={style.stroke}
          fill={style.stroke}
          strokeWidth={style.strokeWidth}
          pointerLength={ARROWHEAD_SIZE}
          pointerWidth={ARROWHEAD_SIZE}
          lineCap="round"
          lineJoin="round"
          strokeScaleEnabled={false}
          {...(style.dash ? { dash: style.dash } : {})}
        />
      ) : (
        <Line
          points={node.points}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          lineCap="round"
          lineJoin="round"
          strokeScaleEnabled={false}
          {...(style.dash ? { dash: style.dash } : {})}
        />
      )}
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

export default LinearNodeBox;
