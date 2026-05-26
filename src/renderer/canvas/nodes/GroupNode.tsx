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
//   - Subagent C (this PR): editable label (double-click the header → an HTML
//     overlay input in `ui/GroupOverlayLayer.tsx`; the Konva Text below is the
//     read-mode display) and COLLAPSE — a chevron toggle in the header flips
//     `collapsed`; when collapsed the header shows the hidden-descendant count
//     ("Group (5)") and Canvas.tsx filters the subtree out of the render.
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

import { useMemo, useRef } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Line, Rect, Text } from "react-konva";
import type { GroupNode } from "../../store/nodes.js";
import { useNodes } from "../../store/nodes.js";
import { useHistory } from "../../store/history.js";
import { useViewport } from "../../store/viewport.js";
import { resolveColor } from "./TextNode.js";
// NOTE(A): colors only — theme-aware default fill/border/header/label. Resize
// handles + drag/collapse/reparent are NOT touched (sibling C owns resize).
import { useResolvedTheme } from "../../theme/useResolvedTheme.js";
import { resolveNodeStyle } from "./nodeStyle.js";
import { descendantsOf, childrenOf, setParent } from "../../store/reparent.js";
import { reparentOnDrop } from "../interactions/dropReparent.js";
import { isMostlyInside } from "../interactions/groupHitTest.js";
import {
  handleCursor,
  handlePosition,
  RESIZE_HANDLES,
} from "../interactions/resize.js";
import { startHandleResize } from "./useResizeHandle.js";

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
const BORDER_WIDTH = 2;
const BORDER_DASH = [8, 6];
const SELECTED_BORDER_COLOR = "#6965db"; // Excalidraw purple (primary)
const SELECTED_BORDER_WIDTH = 3;

// NOTE(A): theme-aware group palette. Light keeps the original slate look; dark
// uses a lighter slate so the dashed container + header read against the dark
// canvas instead of vanishing. Body/header are translucent so children on top
// stay legible in both themes.
const GROUP_THEME = {
  light: {
    border: "#94a3b8", // slate-400 — heavier than the text card's slate-300
    body: "rgba(148, 163, 184, 0.10)", // slate-400 @ 10%
    header: "rgba(148, 163, 184, 0.18)",
    label: "#475569", // slate-600
  },
  dark: {
    border: "#6b7280", // slate-500 — visible on the dark canvas
    body: "rgba(148, 163, 184, 0.10)",
    header: "rgba(148, 163, 184, 0.22)",
    label: "#cbd5e1", // slate-300 — legible on dark
  },
} as const;

/** Header strip height (canvas units) that holds the group label. */
export const GROUP_HEADER_HEIGHT = 28;

/** Minimum container size — generously larger than a text card so a fresh
 *  group has room for children. Sibling B's resize / drag-in logic can read
 *  these. */
export const GROUP_MIN_WIDTH = 320;
export const GROUP_MIN_HEIGHT = 200;

const LABEL_FONT_SIZE = 13;

// Resize-handle visuals — mirror TextNode's so a group's 8-handle resize
// looks/behaves the same as a card's. Sized in SCREEN pixels (divided by zoom)
// so they stay grabbable at any zoom. (Phase 6 sibling B.)
const HANDLE_SCREEN_SIZE = 10;
const HANDLE_FILL = "#ffffff";
const HANDLE_STROKE = "#6965db";
const HANDLE_STROKE_WIDTH = 1.5;

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
  // NOTE(A): colors only. Theme-aware group palette + per-node style. The
  // resolver gives us node opacity + (when set) a custom border color; the
  // group's distinctive tinted-body / dashed-border / header look is preserved.
  const theme = useResolvedTheme();
  const palette = GROUP_THEME[theme];
  const style = resolveNodeStyle(node, theme, "group");

  // A user-picked fill color (`backgroundColor` or legacy `color`) tints the
  // body at low alpha; otherwise the faint themed default. Body uses an rgba
  // string (not Konva opacity) so the alpha applies to the fill only, not the
  // border. `node.opacity` is applied to the whole Group below.
  const fillColor = node.backgroundColor ?? node.color;
  const bodyFill = fillColor
    ? hexToRgba(resolveColor(fillColor), 0.12)
    : palette.body;
  // Border: explicit user stroke color when set, else the themed default.
  const borderColor = node.strokeColor ? style.stroke : palette.border;
  // Border dash: honor an explicit user strokeStyle exactly (solid -> no dash);
  // otherwise keep the group's signature dashed outline.
  const borderDash = node.strokeStyle ? style.dash : BORDER_DASH;

  // Drag bookkeeping: the group's origin at drag start plus a snapshot of
  // every DESCENDANT's start (x,y). We add the group's delta to each
  // descendant's recorded start (never accumulating off the live store, which
  // would compound rounding drift) — mirrors TextNode's peer-move pattern.
  const dragRef = useRef<{
    originX: number;
    originY: number;
    descendants: { id: string; x: number; y: number }[];
  } | null>(null);

  // Subscribe to zoom so resize handles keep a constant screen size.
  const zoom = useViewport((s) => s.zoom);
  const handleCanvasSize = HANDLE_SCREEN_SIZE / zoom;
  const handles = useMemo(() => RESIZE_HANDLES, []);

  // Subscribe to the node array so the collapsed header's child count stays
  // live as nodes are added / removed / reparented. We count the WHOLE subtree
  // (descendantsOf, not just direct children) because collapse hides the whole
  // subtree, so the count reflects exactly what's hidden.
  const allNodes = useNodes((s) => s.nodes);
  const descendantCount = node.collapsed
    ? descendantsOf(allNodes, node.id).length
    : 0;

  // Collapse toggle (Phase 6 sibling C). One undo step per toggle (capture
  // before the flip). Stops propagation so clicking the chevron neither starts
  // a group drag nor changes the selection.
  const toggleCollapsed = (
    e: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>,
  ) => {
    e.cancelBubble = true;
    useHistory.getState().capture();
    useNodes.getState().updateNode(node.id, { collapsed: !node.collapsed });
  };

  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};

  // Drag the group → move the WHOLE subtree (children, grandchildren, …)
  // together. One undo step per gesture (capture on start). Phase 6 sibling B
  // extended A's minimal self-drag at the NOTE marker below.
  const onDragStart = (e: KonvaEventObject<DragEvent>) => {
    useHistory.getState().capture();
    const liveNodes = useNodes.getState().nodes;
    // Snapshot every descendant's start position so we apply a clean delta on
    // each tick. descendantsOf walks the full subtree, so nested groups (and
    // their children) move correctly too (plan §6 nested-groups criterion).
    const descendants = descendantsOf(liveNodes, node.id).map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
    }));
    dragRef.current = {
      originX: e.target.x(),
      originY: e.target.y(),
      descendants,
    };
  };

  const onDragMove = (e: KonvaEventObject<DragEvent>) => {
    const x = Math.round(e.target.x());
    const y = Math.round(e.target.y());
    useNodes.getState().moveNode(node.id, x, y);
    // NOTE(claude/phase-6-A → extended by phase-6-B): move the group's whole
    // subtree by the same delta. The group's OWN position is already moved by
    // Konva's draggable (the moveNode above); here we only move the
    // descendants, so we never double-apply to the group itself.
    const g = dragRef.current;
    if (g && g.descendants.length > 0) {
      const dx = e.target.x() - g.originX;
      const dy = e.target.y() - g.originY;
      const move = useNodes.getState().moveNode;
      for (const d of g.descendants) {
        move(d.id, Math.round(d.x + dx), Math.round(d.y + dy));
      }
    }
  };

  const onDragEnd = () => {
    // Phase 6 (sibling B): a group can be dropped INTO another group (nested
    // groups) or out to the top level. Reparent by the group's center against
    // the other group rects; reparentOnDrop excludes this group's own subtree
    // so it can never be dropped into itself / a descendant (cycle guard is
    // the backstop). Folds into the same undo step as the move (capture ran on
    // drag start; setParent does not re-capture).
    reparentOnDrop(node.id);
    dragRef.current = null;
  };

  // --- Resize handles ----------------------------------------------------
  // Groups are resized with the same 8-handle affordance as text cards, but
  // with the larger group minimums. Children are NOT resized with the group.
  // On resize END, any DIRECT child no longer mostly inside the new bounds is
  // detached to the top level (plan §6: "children outside new bounds get
  // parentId cleared"). The whole resize is one undo step (capture on start).
  // Resize is pointer-driven via startHandleResize (see useResizeHandle.ts):
  // handles are NOT Konva-draggable, so they no longer fight the store
  // re-render (the shake) and no longer start a group MOVE (the press cancels
  // bubbling inside startHandleResize). `onResizeEnd` runs as its `onEnd`.
  const onResizeEnd = () => {
    // Detach direct children that the resize pushed (mostly) outside the new
    // bounds. Read live geometry after the resize settled. Wrapped in a
    // transact so the detaches are one undo step (the capture on resize START
    // already snapshotted; transact here is a no-op capture but groups any
    // multi-child detach cleanly).
    const liveNodes = useNodes.getState().nodes;
    const self = liveNodes.find((n) => n.id === node.id);
    if (!self) return;
    const bounds = {
      x: self.x,
      y: self.y,
      width: self.width,
      height: self.height,
    };
    const escapees = childrenOf(liveNodes, node.id).filter(
      (child) =>
        !isMostlyInside(
          { x: child.x, y: child.y, width: child.width, height: child.height },
          bounds,
        ),
    );
    for (const child of escapees) {
      setParent(child.id, null);
    }
  };

  const labelBase = node.label ?? "Group";
  // Collapsed groups append the hidden-descendant count, e.g. "Group (5)".
  const labelText = node.collapsed
    ? `${labelBase} (${descendantCount})`
    : labelBase;

  // Chevron geometry: a small triangle on the left of the header. Points DOWN
  // when expanded (subtree visible below), RIGHT when collapsed (subtree
  // tucked away) — the familiar disclosure-triangle convention.
  const chevronCx = 14;
  const chevronCy = GROUP_HEADER_HEIGHT / 2;
  const chevronR = 5;
  const chevronPoints = node.collapsed
    ? // pointing RIGHT (collapsed)
      [
        chevronCx - chevronR / 2,
        chevronCy - chevronR,
        chevronCx - chevronR / 2,
        chevronCy + chevronR,
        chevronCx + chevronR,
        chevronCy,
      ]
    : // pointing DOWN (expanded)
      [
        chevronCx - chevronR,
        chevronCy - chevronR / 2,
        chevronCx + chevronR,
        chevronCy - chevronR / 2,
        chevronCx,
        chevronCy + chevronR,
      ];

  return (
    <Group
      x={node.x}
      y={node.y}
      name="group-node"
      id={node.id}
      draggable
      // NOTE(A): node opacity applies to the whole container.
      opacity={style.opacity}
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
        stroke={selected ? SELECTED_BORDER_COLOR : borderColor}
        strokeWidth={selected ? SELECTED_BORDER_WIDTH : BORDER_WIDTH}
        // Dashed when unselected (the container "outline" look); a solid
        // purple ring when selected, matching the text-card focus style.
        // A user-chosen strokeStyle overrides the default dash.
        {...(!selected && borderDash ? { dash: borderDash } : {})}
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
        fill={palette.header}
        listening={false}
      />
      {/* Disclosure chevron — points down when expanded, right when
          collapsed. A larger transparent Rect behind it is the real hit
          target so it stays easy to click. Toggling captures + flips
          `collapsed` (one undo step) and stops propagation so it doesn't
          start a group drag or change selection. */}
      <Rect
        x={chevronCx - GROUP_HEADER_HEIGHT / 2}
        y={0}
        width={GROUP_HEADER_HEIGHT}
        height={GROUP_HEADER_HEIGHT}
        fill="transparent"
        onMouseDown={toggleCollapsed}
        onTouchStart={
          toggleCollapsed as unknown as (
            e: KonvaEventObject<TouchEvent>,
          ) => void
        }
        onMouseEnter={(e) => {
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = "pointer";
        }}
        onMouseLeave={(e) => {
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = "";
        }}
      />
      <Line
        points={chevronPoints}
        closed
        fill={palette.label}
        listening={false}
      />
      {/* Read-mode label. Editing happens via the HTML overlay in
          ui/GroupOverlayLayer.tsx (double-click the header). Shifted right of
          the chevron. When collapsed, the text includes the hidden count. */}
      <Text
        x={chevronCx + chevronR + 6}
        y={GROUP_HEADER_HEIGHT / 2 - LABEL_FONT_SIZE / 2}
        width={node.width - (chevronCx + chevronR + 6) - 10}
        text={labelText}
        fontSize={LABEL_FONT_SIZE}
        fontStyle="bold"
        fill={node.fontColor ? style.fontColor : palette.label}
        ellipsis
        wrap="none"
        listening={false}
      />
      {/* Resize handles (only when selected). 8 draggable handles using the
          shared resize math, clamped to the group minimums. On resize end,
          children no longer inside the new bounds are detached. */}
      {selected
        ? handles.map((h) => {
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
                // Pointer-driven resize. NOT draggable — that both fought the
                // store re-render (shake) and let the press start a group MOVE.
                // startHandleResize cancels bubbling + captures once; onResizeEnd
                // (its onEnd) detaches children pushed outside the new bounds.
                onMouseDown={(e) =>
                  startHandleResize(h, e, node.id, {
                    minWidth: GROUP_MIN_WIDTH,
                    minHeight: GROUP_MIN_HEIGHT,
                    onEnd: onResizeEnd,
                  })
                }
                onTouchStart={(e) =>
                  startHandleResize(h, e, node.id, {
                    minWidth: GROUP_MIN_WIDTH,
                    minHeight: GROUP_MIN_HEIGHT,
                    onEnd: onResizeEnd,
                  })
                }
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
