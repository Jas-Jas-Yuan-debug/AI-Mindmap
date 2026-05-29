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
// 4 screen-pixel-equivalent units outside (width × height).
//
// Resize handles (8): rendered when selected. On handle mousedown we
// capture() once, snapshot the live node's bbox + points, then on every
// mousemove compute scale factors (newW/oldW, newH/oldH) and scale every local
// point proportionally. Divide-by-zero is guarded for zero-dimension strokes
// (keep that coordinate unchanged, only shift origin). Non-draggable handles
// drive the resize via stage mousemove listeners (same principle as
// useResizeHandle.ts) so they don't fight the store re-render.
//
// Hex literals only (no CSS vars) — Konva renders to <canvas> and can't read
// CSS custom properties. See nodeStyle.ts for the themed palette.

import { useRef } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Line, Rect } from "react-konva";
import type { DrawNode } from "../../store/nodes.js";
import { useNodes } from "../../store/nodes.js";
import { useHistory } from "../../store/history.js";
import { useResolvedTheme } from "../../theme/useResolvedTheme.js";
import { resolveNodeStyle } from "./nodeStyle.js";
import type { NodeStyleKind } from "./nodeStyle.js";
import { useNodeDrag } from "./useNodeDrag.js";
import { useViewport } from "../../store/viewport.js";
import {
  handleCursor,
  handlePosition,
  RESIZE_HANDLES,
} from "../interactions/resize.js";
import type { ResizeHandle } from "../interactions/resize.js";

// --- Visual constants -------------------------------------------------------
//
// The selection ring uses the brand primary `#6965db` — hex literal required
// because Konva paints to <canvas> and can't read CSS custom properties.
// Ring offset is screen-constant (4 / zoom) so it doesn't balloon at low zoom.

const SELECTED_BORDER_COLOR = "#6965db"; // Excalidraw purple (primary)
const SELECTED_BORDER_WIDTH = 2;

// Resize handle visuals — mirrors GroupNode so all handles look the same.
const HANDLE_SCREEN_SIZE = 10;
const HANDLE_FILL = "#ffffff";
const HANDLE_STROKE = "#6965db";
const HANDLE_STROKE_WIDTH = 1.5;

// Minimum bbox dimension after resize (canvas units).
const MIN_DIM = 8;

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
 * Layer, one per DrawNode in `useNodes().nodes`. Drag, selection, and resize
 * handles handled here; the stroke always renders with tension=0.4 (Catmull-Rom).
 */
export function DrawNodeBox({ node, selected, onSelect }: DrawNodeBoxProps) {
  // Theme-aware style. resolveNodeStyle fills in dark/light defaults for any
  // unset field so an un-styled stroke reads correctly in both themes.
  const theme = useResolvedTheme();
  // Cast required because NodeStyleKind doesn't include "draw" yet — the
  // resolver's kind param only affects cornerRadius, so the cast is safe.
  const style = resolveNodeStyle(node, theme, "draw" as NodeStyleKind);

  // Subscribe to zoom so the selection-ring offset and handle sizes stay
  // constant in screen pixels as the user zooms.
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

  // Screen-constant handle size.
  const handleCanvasSize = HANDLE_SCREEN_SIZE / zoom;

  // --- Points-aware resize --------------------------------------------------
  //
  // Snapshot taken on handle mousedown: node geometry + points. We need the
  // original bbox to compute the scale factor on every subsequent mousemove.
  const resizeRef = useRef<{
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origPoints: number[];
    anchorX: number; // fixed edge/corner in canvas space
    anchorY: number;
    handle: ResizeHandle;
  } | null>(null);

  const startPointsResize = (
    handle: ResizeHandle,
    e: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>,
  ) => {
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage || typeof window === "undefined") return;

    useHistory.getState().capture();

    const live = useNodes.getState().nodes.find((n) => n.id === node.id);
    if (!live || live.type !== "draw") return;

    // Anchor: the fixed corner/edge in canvas space (opposite the dragged handle).
    const right = live.x + live.width;
    const bottom = live.y + live.height;
    let anchorX = live.x;
    let anchorY = live.y;
    switch (handle) {
      case "nw": anchorX = right;  anchorY = bottom; break;
      case "n":  anchorX = live.x; anchorY = bottom; break;
      case "ne": anchorX = live.x; anchorY = bottom; break;
      case "e":  anchorX = live.x; anchorY = live.y; break;
      case "se": anchorX = live.x; anchorY = live.y; break;
      case "s":  anchorX = live.x; anchorY = live.y; break;
      case "sw": anchorX = right;  anchorY = live.y; break;
      case "w":  anchorX = right;  anchorY = live.y; break;
    }

    resizeRef.current = {
      origX: live.x,
      origY: live.y,
      origW: live.width,
      origH: live.height,
      origPoints: [...live.points],
      anchorX,
      anchorY,
      handle,
    };

    const applyResize = () => {
      const snap = resizeRef.current;
      if (!snap) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const v = useViewport.getState();
      const cx = (pointer.x - v.x) / v.zoom;
      const cy = (pointer.y - v.y) / v.zoom;

      const h = snap.handle;

      let newX: number;
      let newY: number;
      let newW: number;
      let newH: number;

      // X dimension
      if (h === "nw" || h === "sw" || h === "w") {
        newX = cx;
        newW = snap.anchorX - cx;
      } else if (h === "ne" || h === "e" || h === "se") {
        newX = snap.anchorX;
        newW = cx - snap.anchorX;
      } else {
        newX = snap.origX;
        newW = snap.origW;
      }

      // Y dimension
      if (h === "nw" || h === "n" || h === "ne") {
        newY = cy;
        newH = snap.anchorY - cy;
      } else if (h === "sw" || h === "s" || h === "se") {
        newY = snap.anchorY;
        newH = cy - snap.anchorY;
      } else {
        newY = snap.origY;
        newH = snap.origH;
      }

      // Clamp to minimum size.
      if (newW < MIN_DIM) {
        newW = MIN_DIM;
        if (h === "nw" || h === "sw" || h === "w") newX = snap.anchorX - MIN_DIM;
      }
      if (newH < MIN_DIM) {
        newH = MIN_DIM;
        if (h === "nw" || h === "n" || h === "ne") newY = snap.anchorY - MIN_DIM;
      }

      // Scale factors — guarded against divide-by-zero.
      const sx = snap.origW !== 0 ? newW / snap.origW : 1;
      const sy = snap.origH !== 0 ? newH / snap.origH : 1;

      // Scale each local point proportionally.
      const scaledPoints = snap.origPoints.map((v2, i) =>
        i % 2 === 0 ? v2 * sx : v2 * sy,
      );

      useNodes.getState().updateNode(node.id, {
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH),
        points: scaledPoints.map(Math.round),
      });
    };

    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      resizeRef.current = null;
      stage.off(".aimdrawresize");
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchend", end);
      window.removeEventListener("blur", end);
    };

    stage.on("mousemove.aimdrawresize touchmove.aimdrawresize", applyResize);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);
    window.addEventListener("blur", end);
  };

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
        hitStrokeWidth={12}
        {...(style.dash ? { dash: style.dash } : {})}
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
      {/* Resize handles — 8 white squares at the bbox corners/edges.
          Non-draggable; pointer-driven via startPointsResize so they don't
          fight the store re-render (mirror of useResizeHandle.ts). Each move
          scales all local points proportionally to the new bbox. */}
      {selected
        ? RESIZE_HANDLES.map((h) => {
            const pos = handlePosition(h, node.width, node.height);
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
                onMouseDown={(e) => startPointsResize(h, e)}
                onTouchStart={(e) => startPointsResize(h, e)}
                onMouseEnter={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container) container.style.cursor = cursor;
                }}
                onMouseLeave={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container) container.style.cursor = "";
                }}
              />
            );
          })
        : null}
    </Group>
  );
}

export default DrawNodeBox;
