// HTML overlay layer for GroupNode containers (Phase 6 PR 3/3 — sibling C).
//
// Konva paints the group container (`canvas/nodes/GroupNode.tsx`): the dashed
// box, header strip, disclosure chevron, and read-mode label. Two affordances
// need DOM, not canvas, so they live here in a sibling overlay that tracks the
// Konva Stage in screen space — the same pattern `NodeOverlayLayer` uses for
// text cards:
//
//   1. Label editing — double-click a group's HEADER strip → an HTML <input>
//      positioned over the header. Commit on Enter / blur (writes
//      `updateNode(groupId, { label })` wrapped in a single history capture),
//      cancel on Escape. The Konva header `Text` is the read-mode display.
//
//   2. Color — right-click ANYWHERE on a group → the shared `ColorPicker`
//      (targetKind "node", since a group IS a node → `updateNode(id,{color})`).
//      `NodeOverlayLayer`'s contextmenu hit-test only covers TEXT nodes, so
//      groups would otherwise have no color entry point.
//
// Pointer-events story mirrors NodeOverlayLayer: the wrapper is
// pointer-events:none so every click/drag passes through to the Konva Stage
// (which owns group select / drag / resize / chevron-toggle). Only the
// edit-mode <input> re-enables pointer events. Double-click + contextmenu are
// captured by window-level listeners that hit-test against the group rects we
// already compute for positioning.
//
// IMPORTANT (scope split): label-edit is GROUPS ONLY here; markdown edit is
// TEXT ONLY in NodeOverlayLayer. Each layer filters the node union to its own
// kind so the two overlays never fight over the same node.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNodes, type AimapNode, type GroupNode } from "../store/nodes.js";
import { useViewport } from "../store/viewport.js";
import { useSelection } from "../store/selection.js";
import { useColorPicker } from "../store/colorPicker.js";
import { useHistory } from "../store/history.js";
import { canvasToScreen } from "../canvas/layout.js";
import { ColorPicker } from "./ColorPicker.js";
import { GROUP_HEADER_HEIGHT } from "../canvas/nodes/GroupNode.js";

/** Screen-space rect for a group's full box + its header strip. */
interface GroupRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Header strip height in screen pixels (canvas units * zoom). */
  headerHeight: number;
}

/** Narrow the runtime node union to group nodes. */
function isGroupNode(n: AimapNode): n is GroupNode {
  return n.type === "group";
}

/** Hit-test a screen point against the group rects; topmost (last) wins. */
function hitTest(rects: GroupRect[], x: number, y: number): GroupRect | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i]!;
    if (
      x >= r.left &&
      x <= r.left + r.width &&
      y >= r.top &&
      y <= r.top + r.height
    ) {
      return r;
    }
  }
  return null;
}

/** True when the point is within a group's HEADER strip (not just its box). */
function inHeader(r: GroupRect, x: number, y: number): boolean {
  return (
    x >= r.left &&
    x <= r.left + r.width &&
    y >= r.top &&
    y <= r.top + r.headerHeight
  );
}

export function GroupOverlayLayer() {
  const allNodes = useNodes((s) => s.nodes);
  const vx = useViewport((s) => s.x);
  const vy = useViewport((s) => s.y);
  const zoom = useViewport((s) => s.zoom);

  const [editingId, setEditingId] = useState<string | null>(null);
  const picker = useColorPicker((s) => s.open);

  const groups = useMemo(() => allNodes.filter(isGroupNode), [allNodes]);

  // Screen rects, recomputed when groups or viewport change. Used for both
  // positioning the edit input and window-level hit-testing.
  const rects: GroupRect[] = useMemo(() => {
    return groups.map((g) => {
      const tl = canvasToScreen({ x: g.x, y: g.y }, { x: vx, y: vy, zoom });
      const br = canvasToScreen(
        { x: g.x + g.width, y: g.y + g.height },
        { x: vx, y: vy, zoom },
      );
      return {
        id: g.id,
        left: tl.x,
        top: tl.y,
        width: br.x - tl.x,
        height: br.y - tl.y,
        headerHeight: GROUP_HEADER_HEIGHT * zoom,
      };
    });
  }, [groups, vx, vy, zoom]);

  // Window-level dblclick on a group HEADER → enter label-edit mode. We only
  // open the editor when the double-click landed on the header strip so a
  // double-click in the group BODY (empty canvas inside the box) still creates
  // a node (Canvas onDblClick) rather than editing the label.
  useEffect(() => {
    const onDblClick = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest(".aim-group-label__edit, .aim-color-picker")) return;
      }
      const hit = hitTest(rects, e.clientX, e.clientY);
      if (!hit || !inHeader(hit, e.clientX, e.clientY)) return;
      // Stop Canvas's create-on-dblclick from also firing.
      e.preventDefault();
      e.stopPropagation();
      useSelection.getState().select(hit.id);
      setEditingId(hit.id);
    };
    window.addEventListener("dblclick", onDblClick, true);
    return () => window.removeEventListener("dblclick", onDblClick, true);
  }, [rects]);

  // Window-level contextmenu on a group → open the color picker. Capture-phase
  // so we run before per-element handlers. NodeOverlayLayer's contextmenu
  // listener only matches TEXT-node rects, so over a group it returns early and
  // ours wins.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest(".aim-color-picker, .aim-group-label__edit")) return;
      }
      const hit = hitTest(rects, e.clientX, e.clientY);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      useColorPicker.getState().show({
        targetId: hit.id,
        targetKind: "node",
        x: e.clientX,
        y: e.clientY,
      });
    };
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => window.removeEventListener("contextmenu", onContextMenu, true);
  }, [rects]);

  const exitEdit = useCallback(() => setEditingId(null), []);
  const closePicker = useCallback(() => useColorPicker.getState().close(), []);

  return (
    <div
      className="aim-group-overlay-layer"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
      }}
      aria-hidden={false}
    >
      {groups.map((g, i) => {
        const r = rects[i]!;
        return editingId === g.id ? (
          <GroupLabelEditor
            key={g.id}
            group={g}
            left={r.left}
            top={r.top}
            width={r.width}
            headerHeight={r.headerHeight}
            onExitEdit={exitEdit}
          />
        ) : null;
      })}
      {picker ? (
        <ColorPicker
          targetId={picker.targetId}
          targetKind={picker.targetKind}
          x={picker.x}
          y={picker.y}
          onClose={closePicker}
        />
      ) : null}
    </div>
  );
}

interface GroupLabelEditorProps {
  group: GroupNode;
  left: number;
  top: number;
  width: number;
  headerHeight: number;
  onExitEdit: () => void;
}

/** A single-line <input> positioned over a group's header strip. */
function GroupLabelEditor({
  group,
  left,
  top,
  width,
  headerHeight,
  onExitEdit,
}: GroupLabelEditorProps) {
  const [draft, setDraft] = useState(group.label ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Guard so a blur fired BY a commit/cancel doesn't double-commit.
  const doneRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const commit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const next = draft.trim();
    const current = group.label ?? "";
    if (next !== current) {
      // One label edit = one undo step. The store still holds the pre-edit
      // label (draft is local), so capturing right before the single
      // updateNode records the correct pre-edit document. An empty label
      // clears the field (the Konva header falls back to "Group").
      useHistory.getState().capture();
      if (next.length === 0) {
        useNodes.setState((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id !== group.id || n.type !== "group") return n;
            const { label: _label, ...rest } = n;
            void _label;
            return rest as AimapNode;
          }),
        }));
      } else {
        useNodes.getState().updateNode(group.id, { label: next });
      }
    }
    onExitEdit();
  }, [draft, group.id, group.label, onExitEdit]);

  const cancel = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onExitEdit();
  }, [onExitEdit]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  return (
    <input
      ref={inputRef}
      className="aim-group-label__edit"
      type="text"
      value={draft}
      placeholder="Group"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
      onContextMenu={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Group label"
      style={{
        position: "fixed",
        left,
        top,
        width,
        height: headerHeight,
        boxSizing: "border-box",
        pointerEvents: "auto",
        font: "bold 13px var(--aim-font-sans, system-ui, sans-serif)",
        color: "#475569",
        background: "#eef2f7",
        border: "1px solid #6965db",
        borderRadius: "6px",
        padding: "0 8px",
        outline: "none",
      }}
    />
  );
}

export default GroupOverlayLayer;
