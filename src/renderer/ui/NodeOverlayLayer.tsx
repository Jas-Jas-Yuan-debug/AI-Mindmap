// HTML overlay layer for the node cards (Phase 2 PR 3 — sibling subagent C).
//
// Konva is a canvas-based scene graph — it cannot render Markdown or host a
// real <textarea>. The whiteboard's text editing + markdown view live in a
// sibling DOM layer that tracks the Konva Stage in screen space. This is
// the standard pattern: Konva paints the card backgrounds; HTML overlays
// paint the editable / formatted text on top.
//
// Layer composition (App.tsx):
//   <Canvas /> (Konva Stage, z-1)
//   <NodeOverlayLayer /> (this, between Canvas and Chrome, z-50)
//   <Chrome /> (floating Islands, z-100)
//
// Pointer-events story:
//   - Wrapper has pointer-events: none. Read-mode overlays inherit; every
//     left-click / drag passes through to the Konva Stage, so Konva keeps
//     full ownership of select + drag + pan.
//   - dblclick (enter edit mode) and contextmenu (open color picker) are
//     captured by *window-level* listeners that hit-test against the node
//     screen rects we already compute for positioning.
//   - Edit-mode overlay re-enables pointer events on the textarea so the
//     user can type.
//
// Color picker: Phase 3 PR 3 moved the picker's open/close state into a
// shared Zustand slice (`useColorPicker`) so the edge right-click path
// (in `useEdgeContextMenu.ts`) can drive the same picker UI. Local React
// state would have forced a parallel picker instance, which is worse UX.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNodes, type AimapNode, type TextNode } from "../store/nodes.js";
import { useViewport } from "../store/viewport.js";
import { useSelection } from "../store/selection.js";
import { useColorPicker } from "../store/colorPicker.js";
import { canvasToScreen } from "../canvas/layout.js";
import { NodeOverlay, consumePendingEdit } from "./NodeOverlay.js";
import { ColorPicker } from "./ColorPicker.js";

interface OverlayRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Hit-test a screen point against a list of overlay rects. Topmost wins
 *  (last in array — matches Konva's z-order: array tail renders on top). */
function hitTest(rects: OverlayRect[], x: number, y: number): OverlayRect | null {
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

/** Narrow the runtime node union down to text nodes. Group nodes (Phase 6)
 *  have no markdown body / editable text, so they get no DOM overlay — the
 *  Konva `GroupNodeBox` draws them entirely, and their (future) label editor
 *  is sibling C's scope, not this markdown overlay. */
function isTextNode(n: AimapNode): n is TextNode {
  return n.type === "text";
}

export function NodeOverlayLayer() {
  const allNodes = useNodes((s) => s.nodes);
  const vx = useViewport((s) => s.x);
  const vy = useViewport((s) => s.y);
  const zoom = useViewport((s) => s.zoom);

  const [editingId, setEditingId] = useState<string | null>(null);
  const picker = useColorPicker((s) => s.open);

  // Only text nodes get a markdown / edit overlay. Groups are drawn purely in
  // Konva (GroupNodeBox); filtering here means the rest of this component can
  // treat every entry as a TextNode without per-item type guards.
  const nodes = useMemo(() => allNodes.filter(isTextNode), [allNodes]);

  // Precompute screen rects once per render — used both for positioning the
  // overlays AND for window-level hit-testing.
  const rects: OverlayRect[] = useMemo(() => {
    return nodes.map((node) => {
      const tl = canvasToScreen(
        { x: node.x, y: node.y },
        { x: vx, y: vy, zoom },
      );
      const br = canvasToScreen(
        { x: node.x + node.width, y: node.y + node.height },
        { x: vx, y: vy, zoom },
      );
      return {
        id: node.id,
        left: tl.x,
        top: tl.y,
        width: br.x - tl.x,
        height: br.y - tl.y,
      };
    });
  }, [nodes, vx, vy, zoom]);

  // Window-level dblclick: enter edit mode on the hit card.
  useEffect(() => {
    const onDblClick = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest(".aim-node-overlay__edit, .aim-color-picker")) return;
      }
      const hit = hitTest(rects, e.clientX, e.clientY);
      if (!hit) return;
      useSelection.getState().select(hit.id);
      setEditingId(hit.id);
    };
    window.addEventListener("dblclick", onDblClick, true);
    return () => window.removeEventListener("dblclick", onDblClick, true);
  }, [rects]);

  // Window-level contextmenu: open the color picker on the hit card.
  // Edge right-click is handled by `useEdgeContextMenu` (Phase 3 PR 3),
  // which runs as a Stage-container listener — node hit-test (this) wins
  // when the cursor sits over a card rect (window-level capture-phase
  // listeners fire before per-element ones).
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest(".aim-color-picker, .aim-node-overlay__edit")) return;
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

  // Mount-effect: claim any pending edit id left by sibling B's
  // create-on-double-click flow.
  useEffect(() => {
    const pending = consumePendingEdit();
    if (typeof pending === "string" && pending.length > 0) {
      setEditingId(pending);
    }
  }, []);

  // Watch the selection store's `pendingEditId` for post-mount changes.
  useEffect(() => {
    const unsub = useSelection.subscribe(() => {
      const pending = consumePendingEdit();
      if (typeof pending === "string" && pending.length > 0) {
        setEditingId(pending);
      }
    });
    return unsub;
  }, []);

  const exitEdit = useCallback(() => setEditingId(null), []);
  const closePicker = useCallback(() => useColorPicker.getState().close(), []);

  return (
    <div
      className="aim-node-overlay-layer"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
      }}
      aria-hidden={false}
    >
      {nodes.map((node, i) => {
        const r = rects[i]!;
        return (
          <NodeOverlay
            key={node.id}
            node={node}
            left={r.left}
            top={r.top}
            width={r.width}
            height={r.height}
            editing={editingId === node.id}
            onExitEdit={exitEdit}
          />
        );
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

export default NodeOverlayLayer;
