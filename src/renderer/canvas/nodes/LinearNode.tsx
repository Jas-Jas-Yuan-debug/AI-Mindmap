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
// outside the node's (width × height) bbox.
//
// Resize handles (8): rendered when selected, like GroupNode. On handle
// mousedown we capture() once, snapshot the live node's bbox + points, compute
// a scale factor as the bbox changes, and apply it to every local point so the
// stroke scales proportionally. Divide-by-zero is guarded (zero-width/height
// dimension keeps its coordinate unchanged).
//
// Curved lines: when `node.curved === true` the Line/Arrow renders with
// `tension={0.5}` (Catmull-Rom) for a smooth curve through all points.
//
// Bend / interior-point handles: when selected and the line has exactly 2
// points (4 numbers), a single draggable dot sits at the midpoint — dragging
// it inserts a 3rd point at the drag position. When the line already has >2
// points, every INTERIOR point gets its own draggable dot for direct editing.
//
// Arrow pointerLength / pointerWidth: fixed at 10 canvas units so the arrowhead
// reads at any zoom. `strokeScaleEnabled={false}` keeps the stroke visually
// constant as the user zooms — matches the Origin marker + rest of the chrome.
//
// Hex literals only (no CSS vars) — Konva renders to <canvas> and can't read
// CSS custom properties. See nodeStyle.ts for the themed palette.

import { useRef } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Arrow, Line, Rect, Circle } from "react-konva";
import type { LinearNode } from "../../store/nodes.js";
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
const ARROWHEAD_SIZE = 10; // canvas units; constant regardless of zoom

// Resize handle visuals — mirrors GroupNode so all handles look the same.
const HANDLE_SCREEN_SIZE = 10;
const HANDLE_FILL = "#ffffff";
const HANDLE_STROKE = "#6965db";
const HANDLE_STROKE_WIDTH = 1.5;

// Bend-point dot size in screen pixels — small enough not to crowd the line.
const BEND_DOT_SCREEN_SIZE = 6;

// Minimum bbox dimension after resize (canvas units). Prevents collapsing to
// a degenerate size that makes the handles unusable.
const MIN_DIM = 8;

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
 * one per LinearNode in `useNodes().nodes`. Drag, selection, resize handles,
 * curved rendering, and bend/interior-point editing handled here.
 */
export function LinearNodeBox({ node, selected, onSelect }: LinearNodeBoxProps) {
  // Theme-aware style. resolveNodeStyle fills in dark/light defaults for any
  // unset field so an un-styled line reads correctly in both themes.
  const theme = useResolvedTheme();
  // Cast required because NodeStyleKind doesn't include "linear" yet — the
  // resolver's kind param only affects cornerRadius, so the cast is safe.
  const style = resolveNodeStyle(node, theme, "linear" as NodeStyleKind);

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

  // Screen-constant sizes for handles and bend dots.
  const handleCanvasSize = HANDLE_SCREEN_SIZE / zoom;
  const bendDotRadius = BEND_DOT_SCREEN_SIZE / zoom;

  // --- Points-aware resize --------------------------------------------------
  //
  // Snapshot taken on handle mousedown: node geometry + points. We need the
  // original bbox to compute the scale factor on every subsequent mousemove.
  // Using a ref (not state) so the snapshot never triggers a re-render.
  const resizeRef = useRef<{
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origPoints: number[];
    anchorX: number; // fixed edge/corner in canvas space (opposite to handle)
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

    // Snapshot live geometry.
    const live = useNodes.getState().nodes.find((n) => n.id === node.id);
    if (!live || live.type !== "linear") return;

    // Determine the fixed "anchor" — the canvas-space corner/edge that should
    // NOT move as the opposite handle is dragged.
    //   nw  → anchor is se corner  → anchorX = x+w,  anchorY = y+h
    //   n   → anchor is s edge     → anchorY = y+h   (anchorX not meaningful for pure-Y handles but we use x for the fixed side)
    //   ne  → anchor is sw corner  → anchorX = x,    anchorY = y+h
    //   e   → anchor is w edge     → anchorX = x
    //   se  → anchor is nw corner  → anchorX = x,    anchorY = y
    //   s   → anchor is n edge     → anchorY = y
    //   sw  → anchor is ne corner  → anchorX = x+w,  anchorY = y
    //   w   → anchor is e edge     → anchorX = x+w
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

      // Compute new bbox from the fixed anchor + cursor, matching the same
      // logic as computeResize() in resize.ts but applied in terms of the
      // anchor corner.
      let newX: number;
      let newY: number;
      let newW: number;
      let newH: number;

      const h = snap.handle;

      // X dimension
      if (h === "nw" || h === "sw" || h === "w") {
        // Left edge moves; right edge (anchorX) is fixed.
        newX = cx;
        newW = snap.anchorX - cx;
      } else if (h === "ne" || h === "e" || h === "se") {
        // Right edge moves; left edge (anchorX) is fixed.
        newX = snap.anchorX;
        newW = cx - snap.anchorX;
      } else {
        // n / s — x and width unchanged.
        newX = snap.origX;
        newW = snap.origW;
      }

      // Y dimension
      if (h === "nw" || h === "n" || h === "ne") {
        // Top edge moves; bottom edge (anchorY) is fixed.
        newY = cy;
        newH = snap.anchorY - cy;
      } else if (h === "sw" || h === "s" || h === "se") {
        // Bottom edge moves; top edge (anchorY) is fixed.
        newY = snap.anchorY;
        newH = cy - snap.anchorY;
      } else {
        // e / w — y and height unchanged.
        newY = snap.origY;
        newH = snap.origH;
      }

      // Clamp to minimum size. For shifting-origin dimensions, keep the fixed
      // edge in place (same as computeResize's back-propagation).
      if (newW < MIN_DIM) {
        newW = MIN_DIM;
        if (h === "nw" || h === "sw" || h === "w") newX = snap.anchorX - MIN_DIM;
      }
      if (newH < MIN_DIM) {
        newH = MIN_DIM;
        if (h === "nw" || h === "n" || h === "ne") newY = snap.anchorY - MIN_DIM;
      }

      // Scale factors. Guard divide-by-zero for degenerate (zero-dimension) nodes.
      const sx = snap.origW !== 0 ? newW / snap.origW : 1;
      const sy = snap.origH !== 0 ? newH / snap.origH : 1;

      // Scale each local point: px → px * sx, py → py * sy.
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
      stage.off(".aimlinresize");
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchend", end);
      window.removeEventListener("blur", end);
    };

    stage.on("mousemove.aimlinresize touchmove.aimlinresize", applyResize);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);
    window.addEventListener("blur", end);
  };

  // --- Bend / interior-point handles ----------------------------------------
  //
  // 2-point line: show a single dot at the geometric midpoint. Dragging it
  // inserts a middle point (3 points total).
  //
  // >2 points: show a draggable dot on every INTERIOR point (not first/last)
  // so the user can reshape the multi-segment line.
  //
  // Only rendered when selected.

  const ptCount = node.points.length / 2; // number of (x,y) pairs

  // For a 2-point line the "bend" dot starts at the midpoint, but we track its
  // live drag position in a ref so we can insert the final position.
  // For interior points we use Konva's draggable + onDragMove directly.

  const renderBendHandles = () => {
    if (!selected) return null;

    if (ptCount === 2) {
      // Midpoint in local coords.
      const mx = (node.points[0]! + node.points[2]!) / 2;
      const my = (node.points[1]! + node.points[3]!) / 2;

      return (
        <Circle
          key="bend-mid"
          x={mx}
          y={my}
          radius={bendDotRadius}
          fill={HANDLE_FILL}
          stroke={HANDLE_STROKE}
          strokeWidth={HANDLE_STROKE_WIDTH}
          strokeScaleEnabled={false}
          draggable
          // Stop bubbling so the dot drag doesn't move the whole node.
          onMouseDown={(e) => { e.cancelBubble = true; }}
          onTouchStart={(e) => { e.cancelBubble = true; }}
          onDragStart={(e) => {
            e.cancelBubble = true;
            useHistory.getState().capture();
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const lx = Math.round(e.target.x());
            const ly = Math.round(e.target.y());
            // Insert as 3rd point: [p0x, p0y, lx, ly, p1x, p1y]
            const newPts = [
              node.points[0]!, node.points[1]!,
              lx, ly,
              node.points[2]!, node.points[3]!,
            ];
            useNodes.getState().updateNode(node.id, { points: newPts });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
          }}
        />
      );
    }

    // >2 points: interior points only (skip index 0 and last).
    const dots = [];
    for (let i = 1; i < ptCount - 1; i++) {
      const px = node.points[i * 2]!;
      const py = node.points[i * 2 + 1]!;
      const idx = i; // closure capture
      dots.push(
        <Circle
          key={`bend-${i}`}
          x={px}
          y={py}
          radius={bendDotRadius}
          fill={HANDLE_FILL}
          stroke={HANDLE_STROKE}
          strokeWidth={HANDLE_STROKE_WIDTH}
          strokeScaleEnabled={false}
          draggable
          onMouseDown={(e) => { e.cancelBubble = true; }}
          onTouchStart={(e) => { e.cancelBubble = true; }}
          onDragStart={(e) => {
            e.cancelBubble = true;
            useHistory.getState().capture();
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const lx = Math.round(e.target.x());
            const ly = Math.round(e.target.y());
            // Update just this interior point in the array.
            const newPts = [...node.points];
            newPts[idx * 2] = lx;
            newPts[idx * 2 + 1] = ly;
            useNodes.getState().updateNode(node.id, { points: newPts });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
          }}
        />,
      );
    }
    return <>{dots}</>;
  };

  // When curved, pass tension=0.5 so Konva renders a Catmull-Rom spline
  // through all points instead of a polyline.
  const tensionProp = node.curved ? { tension: 0.5 } : {};

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
      {/* Line or arrow body — only one renders, chosen by node.linear.
          tension={0.5} (from tensionProp) is added when node.curved is true,
          giving Catmull-Rom smooth interpolation through multi-point lines. */}
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
          hitStrokeWidth={12}
          {...tensionProp}
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
          hitStrokeWidth={12}
          {...tensionProp}
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
      {/* Resize handles — 8 white squares at the bbox corners/edges.
          Non-draggable; pointer-driven via startPointsResize so they don't
          fight the store re-render (same principle as useResizeHandle.ts). */}
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
      {/* Bend / interior-point handles — draggable dots for reshaping the line.
          Shown only when selected. A 2-point line gets a single midpoint dot
          that inserts a 3rd point on drag; lines with >2 points get a dot on
          each interior point for direct editing. */}
      {renderBendHandles()}
    </Group>
  );
}

export default LinearNodeBox;
