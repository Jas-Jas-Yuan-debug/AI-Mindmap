// Konva renderer for a single GroupNode container (Phase 6 foundation —
// sibling subagent A).
//
// Phase 6 scope split (3 sibling subagents, one phase):
//   - Subagent A (this PR): the *container shape* — a titled, dashed,
//     subtly-tinted rounded rect that renders BEHIND its children (z-order
//     handled in Canvas.tsx), a static header label, plus a minimal
//     draggable so a group can be moved on its own. The reparent primitives
//     (cycle-safe setParent / isDescendant / childrenOf / descendantsOf) live
//     in `../../store/reparent.ts`.
//   - Subagent B: drag-a-node-into / out-of a group (sets/clears parentId via
//     A's `setParent`), and "drag the group → all children move together"
//     (extends the minimal drag below to also move `childrenOf(group)`).
//   - Subagent C: editable label (replaces the static header Text below) and
//     collapse (hide descendants + show child count) — this file only renders
//     a tiny placeholder affordance for `collapsed` today.
//
// Drag (minimal, foundation only): Konva's built-in `draggable` mirrors this
// group's own x/y into the store via `moveNode`, so a group is at least
// movable in isolation. It does NOT yet move children — that's sibling B's
// "group move" work, which will read `childrenOf(useNodes().nodes, group.id)`
// from reparent.ts and apply the same delta. We capture() once on drag start
// so the move is a single undo step, matching TextNode.
//
// Hit-testing: the Group is stamped `name="group-node"` + `id={group.id}` so
// sibling B's drag-in/out hit-test (and any lasso / selection code) can
// identify a group container by walking the Konva ancestor chain — mirrors
// the `name="text-node"` convention TextNode established.

import { useRef } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Rect, Text } from "react-konva";
import type { GroupNode } from "../../store/nodes.js";
import { useNodes } from "../../store/nodes.js";
import { useHistory } from "../../store/history.js";
import { resolveColor } from "./TextNode.js";

// --- Visual constants -------------------------------------------------
//
// Groups read as roomy containers, visually distinct from text cards:
//   - thicker, DASHED border (text cards are thin + solid) so the container
//     boundary is obvious even when full of children;
//   - a faint translucent fill so children render legibly ON TOP of the
//     group (z-order in Canvas.tsx draws groups first / behind);
//   - a header strip across the top holding the (static, for now) label.
//
// Hex literals (not CSS vars) because Konva paints to <canvas> and can't read
// CSS custom properties — same constraint TextNode documents. Phase 8 will
// plumb themed values through a palette helper.

const BORDER_RADIUS = 14;
const BORDER_COLOR = "#94a3b8"; // slate-400 — heavier than the text card's slate-300
const BORDER_WIDTH = 2;
const BORDER_DASH = [8, 6];
const SELECTED_BORDER_COLOR = "#6965db"; // Excalidraw purple (primary)
const SELECTED_BORDER_WIDTH = 3;

/** Header strip height (canvas units) that holds the group label. */
export const GROUP_HEADER_HEIGHT = 28;

/** Minimum container size — generously larger than a text card so a fresh
 *  group has room for children. Sibling B's resize / drag-in logic can read
 *  these. */
export const GROUP_MIN_WIDTH = 320;
export const GROUP_MIN_HEIGHT = 200;

/** Faint default body fill so children stay legible on top. When the user
 *  picks a color (sibling C), we tint with it at low alpha instead. */
const DEFAULT_BODY_FILL = "rgba(148, 163, 184, 0.10)"; // slate-400 @ 10%
const HEADER_FILL = "rgba(148, 163, 184, 0.18)";
const LABEL_COLOR = "#475569"; // slate-600
const LABEL_FONT_SIZE = 13;

export interface GroupNodeBoxProps {
  node: GroupNode;
  selected: boolean;
  /**
   * Pointer-down handler wired by Canvas.tsx to drive selection, exactly like
   * TextNode's `onSelect`. Typed against MouseEvent because Konva models
   * `onMouseDown` as MouseEvent-only; touch still reaches it at runtime.
   */
  onSelect?: (e: KonvaEventObject<MouseEvent>) => void;
}

/**
 * Single Konva group container. Rendered inside the Canvas content Layer,
 * BEHIND non-group nodes (see Canvas.tsx z-order). Children are NOT nested
 * inside this Konva Group — parenting is logical (`parentId` in the store),
 * not a Konva scene-graph parent — so children keep their own absolute
 * coordinates and z-order independent of the container.
 */
export function GroupNodeBox({ node, selected, onSelect }: GroupNodeBoxProps) {
  // A user-picked color tints the body at low alpha; otherwise the faint
  // slate default. We resolve the hex then overlay our own alpha via Konva's
  // separate fill + opacity isn't ideal (it'd dim the border too), so we keep
  // the body fill as an rgba string built from the resolved hex when set.
  const bodyFill = node.color
    ? hexToRgba(resolveColor(node.color), 0.12)
    : DEFAULT_BODY_FILL;

  const dragRef = useRef<{ originX: number; originY: number } | null>(null);

  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};

  // Minimal drag: move THIS group only. Sibling B extends this to also move
  // childrenOf(group). One undo step per gesture (capture on start).
  const onDragStart = (e: KonvaEventObject<DragEvent>) => {
    useHistory.getState().capture();
    dragRef.current = { originX: e.target.x(), originY: e.target.y() };
  };

  const onDragMove = (e: KonvaEventObject<DragEvent>) => {
    const x = Math.round(e.target.x());
    const y = Math.round(e.target.y());
    useNodes.getState().moveNode(node.id, x, y);
    // NOTE(claude/phase-6-A): children intentionally NOT moved here — that is
    // sibling B's "group move" scope (read childrenOf(nodes, node.id) and
    // apply the same delta). Leaving the hook obvious so B can extend it.
  };

  const onDragEnd = () => {
    dragRef.current = null;
  };

  const labelText = node.label ?? "Group";

  return (
    <Group
      x={node.x}
      y={node.y}
      name="group-node"
      id={node.id}
      draggable
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      {...pointerHandlers}
    >
      {/* Body / container rect */}
      <Rect
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        cornerRadius={BORDER_RADIUS}
        fill={bodyFill}
        stroke={selected ? SELECTED_BORDER_COLOR : BORDER_COLOR}
        strokeWidth={selected ? SELECTED_BORDER_WIDTH : BORDER_WIDTH}
        // Dashed when unselected (the container "outline" look); a solid
        // purple ring when selected, matching the text-card focus style.
        {...(selected ? {} : { dash: BORDER_DASH })}
        strokeScaleEnabled={false}
      />
      {/* Header strip — clipped to the top rounded corners via a second Rect
          with only the top corners rounded. */}
      <Rect
        x={0}
        y={0}
        width={node.width}
        height={GROUP_HEADER_HEIGHT}
        cornerRadius={[BORDER_RADIUS, BORDER_RADIUS, 0, 0]}
        fill={HEADER_FILL}
        listening={false}
      />
      {/* Static label (sibling C makes this an editable overlay). */}
      <Text
        x={10}
        y={GROUP_HEADER_HEIGHT / 2 - LABEL_FONT_SIZE / 2}
        width={node.width - 20}
        text={node.collapsed ? `${labelText}  (collapsed)` : labelText}
        fontSize={LABEL_FONT_SIZE}
        fontStyle="bold"
        fill={LABEL_COLOR}
        ellipsis
        wrap="none"
        listening={false}
      />
    </Group>
  );
}

/**
 * Convert a `#rrggbb` (or `#rgb`) hex string to an `rgba()` CSS string with
 * the given alpha. Used to tint a group's body with the user-picked color at
 * low opacity so children stay legible. Falls back to the input string if it
 * isn't a parseable hex (e.g. already an rgba()).
 */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1]!;
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default GroupNodeBox;
