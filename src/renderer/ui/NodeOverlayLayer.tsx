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
//     screen rects we already compute for positioning. This avoids the
//     classic "overlay steals my drag" footgun.
//   - Edit-mode overlay re-enables pointer events on the textarea so the
//     user can type. Sibling B's Konva drag stays "on" during edit, but
//     the textarea sits on top, so drag wouldn't fire from clicks inside
//     the textarea anyway.
//
// Color picker: lives on the same layer because all picker state is
// transient UI; a Zustand slice would be overkill. Local React state.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNodes } from "../store/nodes.js";
import { useViewport } from "../store/viewport.js";
import { useSelection } from "../store/selection.js";
import { canvasToScreen } from "../canvas/layout.js";
import { NodeOverlay, consumePendingEdit } from "./NodeOverlay.js";
import { ColorPicker } from "./ColorPicker.js";

interface ColorPickerState {
  nodeId: string;
  x: number;
  y: number;
}

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

export function NodeOverlayLayer() {
  const nodes = useNodes((s) => s.nodes);
  const vx = useViewport((s) => s.x);
  const vy = useViewport((s) => s.y);
  const zoom = useViewport((s) => s.zoom);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [picker, setPicker] = useState<ColorPickerState | null>(null);

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

  // Window-level dblclick: enter edit mode on the hit card. Capture phase so
  // we win against any nested handler. We intentionally don't preventDefault
  // because Konva's Stage onDblClick still fires for empty-canvas creates;
  // those use `e.target === stage` (see useCreate.ts) so a card double-click
  // doesn't trip them. Returning early when no card is hit keeps the empty-
  // canvas create path intact.
  useEffect(() => {
    const onDblClick = (e: MouseEvent) => {
      // Skip when the click target is already an editable element — the
      // textarea, the color picker, etc.
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest(".aim-node-overlay__edit, .aim-color-picker")) return;
      }
      const hit = hitTest(rects, e.clientX, e.clientY);
      if (!hit) return;
      // Make sure the card is selected so the selection ring shows.
      useSelection.getState().select(hit.id);
      setEditingId(hit.id);
    };
    window.addEventListener("dblclick", onDblClick, true);
    return () => window.removeEventListener("dblclick", onDblClick, true);
  }, [rects]);

  // Window-level contextmenu: open the color picker on the hit card.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest(".aim-color-picker, .aim-node-overlay__edit")) return;
      }
      const hit = hitTest(rects, e.clientX, e.clientY);
      if (!hit) return;
      e.preventDefault();
      setPicker({ nodeId: hit.id, x: e.clientX, y: e.clientY });
    };
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => window.removeEventListener("contextmenu", onContextMenu, true);
  }, [rects]);

  // Mount-effect: if sibling B's create-on-double-click left a pending edit
  // id, claim it. Runs once per layer mount (the layer is mounted at app
  // start and never unmounts).
  useEffect(() => {
    const pending = consumePendingEdit();
    if (typeof pending === "string" && pending.length > 0) {
      setEditingId(pending);
    }
  }, []);

  // Watch the selection store's `pendingEditId` for changes AFTER mount —
  // e.g. when the user double-clicks empty canvas (creates a card, sets
  // pendingEditId), this layer is already mounted so the mount-effect
  // above won't re-fire. Subscribing here picks up the post-create signal.
  useEffect(() => {
    // The store may not have pendingEditId yet (pre-B-merge); subscribe in
    // a guarded way via getState reads on each emission. The store always
    // emits on `set()`, even for unrelated slices, which is fine here —
    // we early-out when there's nothing to consume.
    const unsub = useSelection.subscribe(() => {
      const pending = consumePendingEdit();
      if (typeof pending === "string" && pending.length > 0) {
        setEditingId(pending);
      }
    });
    return unsub;
  }, []);

  const exitEdit = useCallback(() => setEditingId(null), []);
  const closePicker = useCallback(() => setPicker(null), []);

  return (
    <div
      className="aim-node-overlay-layer"
      style={{
        position: "fixed",
        inset: 0,
        // Wrapper itself catches no events; dblclick + contextmenu are
        // captured by window-level listeners (see useEffects above), and
        // the edit-mode textarea re-enables pointer events on itself.
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
          nodeId={picker.nodeId}
          x={picker.x}
          y={picker.y}
          onClose={closePicker}
        />
      ) : null}
    </div>
  );
}

export default NodeOverlayLayer;
