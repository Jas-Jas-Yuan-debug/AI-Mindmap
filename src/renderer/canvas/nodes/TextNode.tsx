// Konva renderer for a single TextNode card.
//
// Phase 2 scope split (3 sibling subagents, one phase):
//   - Subagent A (PR #23): rendered the *card shape* — the rounded rect
//     background + border + selection ring. Click-to-select wired via the
//     parent Stage.
//   - Subagent B (this PR): drag-to-move on the card body + 8 resize
//     handles that appear when the card is selected. Delete and create-
//     on-double-click live next to this in `../interactions/`.
//   - Subagent C: HTML <textarea>/markdown overlay positioned over this
//     rect via canvasToScreen — the text itself is rendered in the DOM,
//     not in Konva. (Konva text doesn't do markdown, and an overlay is
//     trivial to position with the existing layout helpers.)
//
// Drag: Konva's built-in `draggable` on the Group handles the move math; we
// just push the new (x, y) into the nodes store on every `onDragMove` so
// sibling C's overlay can track the card during the drag (cheap — the
// store does one shallow array copy per move).
//
// Resize: when `selected`, we render 8 small `<Rect>` handles on top of the
// card. Each is independently draggable. On drag, we read the cursor in
// canvas space and call `computeResize` (../interactions/resize.ts) to get
// the new geometry, then push it through `resizeNode`.
//
// Pan-vs-drag: the Stage's pan handler in `usePan` only activates when
// `e.target === stage`, i.e. on the empty canvas. Drag on a card body or a
// handle has `e.target` set to the card Group (or the handle Rect), so the
// Stage doesn't pan. Verified by reading usePan.onMouseDown.

import { useMemo } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Rect } from "react-konva";
import type { Color, PresetColor, TextNode } from "../../store/nodes.js";
import { useNodes } from "../../store/nodes.js";
import { useViewport } from "../../store/viewport.js";
import {
  computeResize,
  handleCursor,
  handlePosition,
  RESIZE_HANDLES,
  type ResizeHandle,
} from "../interactions/resize.js";

/**
 * Preset color id ("1".."6", per plan §5) → concrete hex.
 *
 * Hues chosen to align with the Mantine / Excalidraw color tier the rest
 * of the app uses; preset "6" is the Excalidraw purple `#6965db` we picked
 * as our primary brand color (plan §5b design tokens). Sibling C's color
 * picker should render swatches in this order.
 *
 * Exported so the color picker (sibling C) can reuse the canonical hex
 * values rather than re-defining them.
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
 * Falls back to white (`#ffffff`) when no color is set; Phase 8 will swap
 * the fallback for a themed default driven by `data-theme="dark"`.
 *
 * Exported for sibling C's color picker preview UI.
 */
export function resolveColor(c: Color | undefined): string {
  if (!c) return "#ffffff";
  if (typeof c === "string" && c.startsWith("#")) return c;
  return PRESET_COLOR_MAP[c as PresetColor] ?? "#ffffff";
}

// --- Visual constants -------------------------------------------------
//
// Border radius matches Excalidraw's card vibe (plan §5b). The selection
// ring uses the brand primary `#6965db` — keeping the hex literal here
// (instead of var(--aim-color-primary)) because Konva renders to canvas
// and can't read CSS custom properties. Phase 8 will plumb theme values
// down via a small palette helper.

const BORDER_RADIUS = 12;
const BORDER_COLOR = "#cbd5e1"; // slate-300, subtle on white
const BORDER_WIDTH = 1;
const SELECTED_BORDER_COLOR = "#6965db"; // Excalidraw purple (primary)
const SELECTED_BORDER_WIDTH = 2;

// Resize-handle visuals. Handles are sized in *screen* pixels so they
// remain easy to grab regardless of zoom; we divide by viewport.zoom to
// get the canvas-space side length.
const HANDLE_SCREEN_SIZE = 10;
const HANDLE_FILL = "#ffffff";
const HANDLE_STROKE = "#6965db";
const HANDLE_STROKE_WIDTH = 1.5;

export interface TextNodeCardProps {
  node: TextNode;
  selected: boolean;
  /**
   * Called on pointer-down (mousedown / touchstart). Wired by Canvas.tsx
   * to drive selection. Sibling C may upgrade this to also enter edit
   * mode on double-click via a parallel handler.
   *
   * Typed against MouseEvent because Konva's prop typings model
   * `onMouseDown` as MouseEvent-only; touch input still reaches the
   * handler through Konva's pointer abstraction at runtime.
   */
  onSelect?: (e: KonvaEventObject<MouseEvent>) => void;
}

/**
 * Single Konva card. Rendered inside the Canvas content Layer, one per
 * node in `useNodes().nodes`. Group wraps the rect so sibling B can add
 * resize handles inside the same `<Group>` later without restructuring.
 */
export function TextNodeCard({ node, selected, onSelect }: TextNodeCardProps) {
  const fill = resolveColor(node.color);
  // Subscribe to zoom so resize handles stay a constant screen size as the
  // user zooms. Konva's children re-render when the prop changes; reading
  // zoom via useViewport keeps the dependency tight.
  const zoom = useViewport((s) => s.zoom);
  const handleCanvasSize = HANDLE_SCREEN_SIZE / zoom;

  // Build optional pointer-event handlers conditionally so we don't pass
  // `undefined` under exactOptionalPropertyTypes. Konva's prop types
  // declare these as required-when-present, and the MouseEvent and
  // TouchEvent handler signatures aren't structurally compatible — so we
  // type the touch handler via a thin cast to the mouse signature.
  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};

  // --- Drag handlers -----------------------------------------------------
  // Konva's draggable does the visual move; we mirror it into the store on
  // each tick so the rest of the app (overlays, edges in Phase 3) sees the
  // node's position live. The store update is cheap (one shallow array
  // copy), and Konva already coalesces drag events to roughly one per
  // animation frame.
  const onDragMove = (e: KonvaEventObject<DragEvent>) => {
    // For the card Group, e.target IS the Group, so its x/y is the new
    // position in canvas space (parent Layer has no transform of its own;
    // pan/zoom live on the Stage).
    const x = Math.round(e.target.x());
    const y = Math.round(e.target.y());
    useNodes.getState().moveNode(node.id, x, y);
  };

  // --- Handle drag math --------------------------------------------------
  // Each resize handle gets its own callback that knows which handle id
  // it is. We compute the cursor in canvas space, then delegate to
  // `computeResize` for the per-handle geometry.
  const handles = useMemo(() => RESIZE_HANDLES, []);

  const onHandleDragMove = (handle: ResizeHandle) =>
    (e: KonvaEventObject<DragEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      // Pointer is in container/screen space (already accounts for the
      // browser's CSS layout). Convert to canvas space via the current
      // viewport.
      const v = useViewport.getState();
      const canvasCursor = {
        x: (pointer.x - v.x) / v.zoom,
        y: (pointer.y - v.y) / v.zoom,
      };
      // Snapshot the latest node state so successive drags compound
      // correctly. computeResize takes the ORIGINAL geometry; we feed it
      // the live geometry here so the result is incremental.
      const live = useNodes.getState().nodes.find((n) => n.id === node.id);
      if (!live) return;
      const result = computeResize(handle, live, canvasCursor);
      useNodes
        .getState()
        .resizeNode(
          node.id,
          Math.round(result.width),
          Math.round(result.height),
          result.x !== undefined ? Math.round(result.x) : undefined,
          result.y !== undefined ? Math.round(result.y) : undefined,
        );
      // Konva positions the handle visually based on its own drag
      // tracking; rather than fighting that (which would cause jitter),
      // we let it ride for the duration of the drag — the handle re-
      // positions to the correct corner/edge on the next render after
      // the store update propagates. Resetting handle.x() / .y() here
      // would conflict with Konva's drag bookkeeping.
    };

  return (
    <Group
      x={node.x}
      y={node.y}
      // `name` lets future hit-test code identify cards (used by sibling B's
      // delete-on-click and by Phase 4 lasso).
      name="text-node"
      // Stash the id on the Konva node so the parent Stage's click handler
      // (Canvas.tsx) can read it off `e.target.getParent()` without needing
      // a closure over props.
      id={node.id}
      draggable
      onDragMove={onDragMove}
      {...pointerHandlers}
    >
      <Rect
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        cornerRadius={BORDER_RADIUS}
        fill={fill}
        stroke={selected ? SELECTED_BORDER_COLOR : BORDER_COLOR}
        strokeWidth={selected ? SELECTED_BORDER_WIDTH : BORDER_WIDTH}
        // Keep the border visually constant under zoom — a 1px line at
        // zoom 4 should still look like 1px, matching the Origin marker
        // and the rest of the chrome.
        strokeScaleEnabled={false}
        // Subtle shadow only when selected so the focus ring reads even
        // against a same-color background. Light enough that 100 cards
        // don't tank perf (Konva caches the shadow per node).
        shadowEnabled={selected}
        shadowColor="#6965db"
        shadowBlur={6}
        shadowOpacity={0.25}
      />
      {selected
        ? handles.map((h) => {
            const pos = handlePosition(h, node.width, node.height);
            // Center the handle on its anchor point: offset by half the
            // handle's canvas-space size.
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
                draggable
                onDragMove={onHandleDragMove(h)}
                // Set the container cursor on hover for clear affordance.
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

export default TextNodeCard;
