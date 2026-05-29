// HTML overlay layer for ShapeNode label editing (V2).
//
// Architecture mirrors GroupOverlayLayer.tsx:
//   - A fixed, pointer-events:none wrapper sits over the Konva Stage.
//   - When `useShapeLabelEdit.editingId` is set to a shape node, a <textarea>
//     (pointer-events:auto) is positioned over that shape using canvas→screen
//     coordinates derived from the live viewport.
//   - The Konva <Text> label in ShapeNode.tsx is hidden while editingId matches
//     (`isEditingLabel` flag) so the textarea provides the single visual.
//   - Commit: Enter (without Shift) or blur → capture history + updateNode.
//   - Cancel: Escape → end() without writing.
//   - The overlay subscribes to the viewport store so it stays aligned during
//     pan/zoom while the editor is open.
//
// Scope: shapes ONLY. Text-card editing (NodeOverlayLayer) and group-label
// editing (GroupOverlayLayer) are independent; the three stores are separate so
// the editors never collide.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useShapeLabelEdit } from "../store/shapeLabelEdit.js";
import { useNodes, type ShapeNode, type AimapNode } from "../store/nodes.js";
import { useViewport } from "../store/viewport.js";
import { useHistory } from "../store/history.js";
import { canvasToScreen } from "../canvas/layout.js";

/** Narrow the runtime node union to shape nodes. */
function isShapeNode(n: AimapNode): n is ShapeNode {
  return n.type === "shape";
}

export function ShapeLabelOverlayLayer() {
  const editingId = useShapeLabelEdit((s) => s.editingId);

  // Subscribe to viewport so the overlay re-renders when pan/zoom changes
  // while the editor is open (keeps the textarea glued to the shape).
  const vx = useViewport((s) => s.x);
  const vy = useViewport((s) => s.y);
  const zoom = useViewport((s) => s.zoom);

  const allNodes = useNodes((s) => s.nodes);

  if (!editingId) return null;

  const node = allNodes.find((n) => n.id === editingId && isShapeNode(n));
  if (!node || !isShapeNode(node)) return null;

  // Convert node's canvas-space top-left and bottom-right to screen pixels.
  const tl = canvasToScreen({ x: node.x, y: node.y }, { x: vx, y: vy, zoom });
  const br = canvasToScreen(
    { x: node.x + node.width, y: node.y + node.height },
    { x: vx, y: vy, zoom },
  );

  return (
    <div
      className="aim-shape-label-overlay-layer"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
      }}
      aria-hidden={false}
    >
      <ShapeLabelEditor
        node={node}
        left={tl.x}
        top={tl.y}
        width={br.x - tl.x}
        height={br.y - tl.y}
        zoom={zoom}
      />
    </div>
  );
}

interface ShapeLabelEditorProps {
  node: ShapeNode;
  left: number;
  top: number;
  width: number;
  height: number;
  zoom: number;
}

/**
 * A multi-line <textarea> positioned exactly over the shape's bounding box.
 * Font size scales with zoom so the textarea text matches the Konva label
 * size at any zoom level.
 */
function ShapeLabelEditor({
  node,
  left,
  top,
  width,
  height,
  zoom,
}: ShapeLabelEditorProps) {
  const [draft, setDraft] = useState(node.text ?? "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Guard: prevent blur from double-committing after an explicit key commit.
  const doneRef = useRef(false);

  // Auto-focus and select all text when the editor opens.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const commit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const next = draft;
    const current = node.text ?? "";
    if (next !== current) {
      // Capture BEFORE the mutation so the pre-edit state is the undo target.
      useHistory.getState().capture();
      useNodes.getState().updateNode(node.id, { text: next });
    }
    useShapeLabelEdit.getState().end();
  }, [draft, node.id, node.text]);

  const cancel = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    useShapeLabelEdit.getState().end();
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && !e.shiftKey) {
      // Plain Enter commits; Shift+Enter inserts a newline (standard behavior).
      e.preventDefault();
      commit();
    }
  };

  // Font size matches ShapeNode.tsx's LABEL_FONT_SIZE (14) scaled by zoom.
  const scaledFontSize = 14 * zoom;
  // Padding matches ShapeNode.tsx's LABEL_PADDING (8) scaled by zoom.
  const scaledPadding = 8 * zoom;

  return (
    <textarea
      ref={textareaRef}
      className="aim-shape-label__edit"
      value={draft}
      placeholder="Label"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
      onContextMenu={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Shape label"
      style={{
        position: "fixed",
        left,
        top,
        width,
        height,
        boxSizing: "border-box",
        pointerEvents: "auto",
        font: `${scaledFontSize}px var(--aim-font-sans, system-ui, sans-serif)`,
        color: "inherit",
        background: "rgba(255,255,255,0.85)",
        border: "1px solid #6965db",
        borderRadius: "4px",
        padding: `${scaledPadding}px`,
        outline: "none",
        resize: "none",
        textAlign: "center",
        // Vertically center short text: flex doesn't work on textarea, so we
        // rely on the user seeing the text from the top but with symmetric
        // padding. The Konva label uses verticalAlign="middle" which is a
        // Konva-specific feature; HTML textarea doesn't support that directly.
        overflowY: "auto",
        lineHeight: "1.4",
      }}
    />
  );
}

export default ShapeLabelOverlayLayer;
