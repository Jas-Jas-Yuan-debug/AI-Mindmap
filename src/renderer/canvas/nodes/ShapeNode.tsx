// Konva renderer for a V2 ShapeNode — rectangle, diamond, or ellipse.
//
// Phase V2 scope: this file is the sole renderer for the "shape" node type
// introduced in the V2 drawing-app feature. It mirrors the conventions
// established by GroupNode.tsx (the primary template) and TextNode.tsx:
//   - Outer <Group> carries id/name stamping, draggable, opacity, and
//     pointerHandlers (onMouseDown / onTouchStart → onSelect).
//   - `useNodeDrag` provides the shared one-undo-step, multi-selection,
//     and reparent-on-drop drag logic — the same hook used by embed nodes.
//   - `resolveNodeStyle(node, theme, "shape")` resolves fill / stroke /
//     dash / cornerRadius / opacity from the node's optional style fields,
//     filling in theme-aware defaults (dark mode won't render a white rect).
//   - Body shape painted at local origin (0,0). Selection ring + 8 resize
//     handles follow GroupNode's exact pattern (screen-constant sizes,
//     `startHandleResize`, `handlePosition` / `handleCursor`).
//
// Hex literals throughout — Konva paints to <canvas> and cannot read CSS
// custom properties; per-theme defaults come from `resolveNodeStyle`.
//
// New JSX transform is active — React is NOT imported (no `import React`).

import { useMemo } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Rect, Ellipse, Line } from "react-konva";
import type { ShapeNode } from "../../store/nodes.js";
import { useResolvedTheme } from "../../theme/useResolvedTheme.js";
import { resolveNodeStyle } from "./nodeStyle.js";
import { useNodeDrag } from "./useNodeDrag.js";
import { useViewport } from "../../store/viewport.js";
import {
  handleCursor,
  handlePosition,
  RESIZE_HANDLES,
  DEFAULT_MIN_WIDTH,
  DEFAULT_MIN_HEIGHT,
} from "../interactions/resize.js";
import { startHandleResize } from "./useResizeHandle.js";

// --- Visual constants -------------------------------------------------
//
// Resize-handle visuals mirror GroupNode / TextNode so all node kinds
// present the same affordance. Sizes are in SCREEN pixels — divided by
// zoom each render so they remain easy to grab at any zoom level.

const HANDLE_SCREEN_SIZE = 10;
const HANDLE_FILL = "#ffffff";
const HANDLE_STROKE = "#6965db";
const HANDLE_STROKE_WIDTH = 1.5;

// Selection ring color — the Excalidraw brand purple, kept as a hex
// literal because Konva can't read CSS vars.
const RING_STROKE = "#6965db";
const RING_STROKE_WIDTH = 2;

export interface ShapeNodeBoxProps {
  node: ShapeNode;
  selected: boolean;
  /**
   * Pointer-down handler wired by Canvas.tsx to drive selection, exactly
   * like TextNode's `onSelect`. Typed against MouseEvent because Konva
   * models `onMouseDown` as MouseEvent-only; touch still reaches it at
   * runtime through Konva's pointer abstraction.
   */
  onSelect?: (e: KonvaEventObject<MouseEvent>) => void;
}

/**
 * Single Konva shape node. Renders a rectangle, diamond, or ellipse at
 * the node's (x, y) with full style resolution, a selection ring, and 8
 * resize handles when selected. Draggable via the shared `useNodeDrag`
 * hook (one undo step, multi-selection, reparent-on-drop).
 */
export function ShapeNodeBox({ node, selected, onSelect }: ShapeNodeBoxProps) {
  // Theme-aware style: fills in dark/light defaults for any unset field
  // so an un-styled shape reads correctly in both themes.
  const theme = useResolvedTheme();
  const style = resolveNodeStyle(node, theme, "shape");

  // Subscribe to zoom so resize handles and the selection ring keep a
  // constant screen size as the user zooms. Matches GroupNode's pattern.
  const zoom = useViewport((s) => s.zoom);
  const handleCanvasSize = HANDLE_SCREEN_SIZE / zoom;

  // Pre-memoize the handle array — same pattern as GroupNode / TextNode.
  const handles = useMemo(() => RESIZE_HANDLES, []);

  // Shared drag behaviour: one undo step per gesture, multi-selection
  // moves together, single-node drop reparents into the group under the
  // cursor. Mirrors the embed-node pattern (NOT the inline version in
  // TextNode, which predates the hook).
  const { onDragStart, onDragMove, onDragEnd } = useNodeDrag(node.id);

  // Build pointer-event handlers conditionally so we never pass `undefined`
  // under exactOptionalPropertyTypes. The touch handler is cast to the
  // mouse signature — identical to the pattern in GroupNode and TextNode.
  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};

  // Selection ring: offset outside the body by a screen-constant 4px gap
  // (divided by zoom), rectangular bbox for all three shape kinds.
  const ringOffset = 4 / zoom;

  // Body paint props shared across all three shape variants: fill, stroke,
  // strokeWidth, optional dash, and strokeScaleEnabled. Built once here so
  // each branch of the switch doesn't repeat them.
  const bodyProps = {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    ...(style.dash ? { dash: style.dash } : {}),
    strokeScaleEnabled: false,
  } as const;

  return (
    <Group
      x={node.x}
      y={node.y}
      name="shape-node"
      id={node.id}
      draggable
      // Node opacity applies to the whole shape (fill + stroke + handles).
      opacity={style.opacity}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      {...pointerHandlers}
    >
      {/* Body — always renders the user's real style so the properties
          panel shows accurate live feedback even while selected.
          Selection is shown by the separate ring rendered below. */}
      {(() => {
        switch (node.shape) {
          case "rectangle":
            return (
              <Rect
                x={0}
                y={0}
                width={node.width}
                height={node.height}
                cornerRadius={style.cornerRadius}
                {...bodyProps}
              />
            );

          case "ellipse":
            // Konva <Ellipse> is centered, so offset by half the node's
            // dimensions to paint it within the (0,0)→(width,height) bbox.
            return (
              <Ellipse
                x={node.width / 2}
                y={node.height / 2}
                radiusX={node.width / 2}
                radiusY={node.height / 2}
                {...bodyProps}
              />
            );

          case "diamond":
            // Four midpoints of the bounding box, forming a rotated square.
            // `closed` tells Konva to close the path back to the first point.
            return (
              <Line
                points={[
                  node.width / 2, 0,
                  node.width,     node.height / 2,
                  node.width / 2, node.height,
                  0,              node.height / 2,
                ]}
                closed
                {...bodyProps}
              />
            );
        }
      })()}

      {/* Selection ring: rendered on top of the body so the user's real
          border style always shows through. Uses a rectangular bbox (fine
          for all three shapes — same as GroupNode's approach). */}
      {selected && (
        <Rect
          x={-ringOffset}
          y={-ringOffset}
          width={node.width + ringOffset * 2}
          height={node.height + ringOffset * 2}
          cornerRadius={style.cornerRadius + ringOffset}
          stroke={RING_STROKE}
          strokeWidth={RING_STROKE_WIDTH}
          strokeScaleEnabled={false}
          fillEnabled={false}
          listening={false}
        />
      )}

      {/* Resize handles (only when selected). 8 handles using the shared
          resize math, clamped to the default minimums. Pointer-driven —
          NOT Konva draggable — to avoid the jitter/shake the draggable
          approach caused (see useResizeHandle.ts for the full explanation).
          startHandleResize cancels bubbling, captures once, and attaches
          stage/window listeners for the rest of the gesture. */}
      {selected
        ? handles.map((h) => {
            const pos = handlePosition(h, node.width, node.height);
            // Centre the handle square on its anchor point.
            const half = handleCanvasSize / 2;
            const cursor = handleCursor(h);
            return (
              <Rect
                key={h}
                x={pos.x - half}
                y={pos.y - half}
                width={handleCanvasSize}
                height={handleCanvasSize}
                fill={HANDLE_FILL}
                stroke={HANDLE_STROKE}
                strokeWidth={HANDLE_STROKE_WIDTH}
                strokeScaleEnabled={false}
                onMouseDown={(e) =>
                  startHandleResize(h, e, node.id, {
                    minWidth: DEFAULT_MIN_WIDTH,
                    minHeight: DEFAULT_MIN_HEIGHT,
                  })
                }
                onTouchStart={(e) =>
                  startHandleResize(h, e, node.id, {
                    minWidth: DEFAULT_MIN_WIDTH,
                    minHeight: DEFAULT_MIN_HEIGHT,
                  })
                }
                // Show the appropriate resize cursor while hovering a handle.
                onMouseEnter={(e) => {
                  const stage = e.target.getStage();
                  const container = stage?.container();
                  if (container) container.style.cursor = cursor;
                }}
                onMouseLeave={(e) => {
                  const stage = e.target.getStage();
                  const container = stage?.container();
                  if (container) container.style.cursor = "";
                }}
              />
            );
          })
        : null}
    </Group>
  );
}

export default ShapeNodeBox;
