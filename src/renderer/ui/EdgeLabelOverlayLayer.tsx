// HTML overlay layer for edge labels (Phase 3 PR 2 — sibling subagent B).
//
// Konva can render text but it can't host a contenteditable / textarea, and
// we want the label edit affordance to match the card edit-mode pattern
// (see NodeOverlayLayer.tsx). So we sandwich another HTML layer between
// Canvas and Chrome:
//
//   <Canvas />                  (Konva Stage, z-1)
//   <NodeOverlayLayer />        (Phase 2 node text overlays, z-50)
//   <EdgeLabelOverlayLayer />   (this, z-51)
//   <Chrome />                  (z-100)
//
// Read mode:
//   - For each edge that has a non-empty `label`, render a small pill badge
//     at the edge's midpoint (screen space).
//   - Wrapper is pointer-events: none so the badge doesn't steal clicks
//     from Konva (edge selection in PR 3 still works).
//   - Edges with no label render nothing.
//
// Edit mode:
//   - Window-level dblclick handler hit-tests against the edge midpoints
//     (with a small click radius) AND against existing label badge rects.
//     If a hit, enter edit mode for that edge id: render a small textarea
//     centered on the midpoint.
//   - Esc / blur / Cmd-Enter commits via `useEdges.getState().updateEdge`.
//     If the trimmed value is empty, drop the field via setState (so the
//     edge has no `label` rather than a "" label — keeps round-trip clean).
//
// Coordinating with NodeOverlayLayer:
//   - We early-out the dblclick handler when the click falls inside ANY
//     node rect (a card double-click is the node's edit affordance, not
//     an edge label edit). This is the same hit-test NodeOverlayLayer
//     already runs; here we just re-run the geometry to avoid a brittle
//     cross-module signal.
//
// Coordinating with sibling C's edge-selection PR:
//   - This file ONLY owns label rendering + edit. Edge selection (click
//     to select, Delete to remove) is sibling C's scope.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEdges, type Edge } from "../store/edges.js";
import { useNodes } from "../store/nodes.js";
import { useViewport } from "../store/viewport.js";
import { anchorPosition, bezierControlPoints } from "../canvas/edges/geometry.js";
import { canvasToScreen } from "../canvas/layout.js";
import "./EdgeLabel.css";

/** Click-radius (screen px) for hit-testing an edge midpoint on dblclick. */
const EDGE_DBLCLICK_RADIUS_PX = 16;

interface MidPoint {
  edgeId: string;
  /** Screen-space midpoint coordinates. */
  x: number;
  y: number;
  label: string | undefined;
}

interface NodeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Cubic Bezier midpoint at t=0.5.
 *
 *   B(0.5) = 0.125*P0 + 0.375*P1 + 0.375*P2 + 0.125*P3
 *
 * Pulled into its own helper so the test (and a potential future tick
 * marker on labels at other `t` values) doesn't duplicate the math.
 */
function bezierMidpoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x,
    y: 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y,
  };
}

export { bezierMidpoint };

export function EdgeLabelOverlayLayer() {
  const edges = useEdges((s) => s.edges);
  const nodes = useNodes((s) => s.nodes);
  const vx = useViewport((s) => s.x);
  const vy = useViewport((s) => s.y);
  const zoom = useViewport((s) => s.zoom);

  const [editingId, setEditingId] = useState<string | null>(null);

  // Build a Map<nodeId, node> once per render so per-edge midpoint
  // computation is O(1) lookup instead of O(N) array scans.
  const nodeById = useMemo(() => {
    const m = new Map<string, (typeof nodes)[number]>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // Precompute every edge's midpoint (in screen space) + the node rects
  // (also screen space) for dblclick hit-testing.
  const midpoints: MidPoint[] = useMemo(() => {
    const out: MidPoint[] = [];
    for (const e of edges) {
      const fromNode = nodeById.get(e.fromNode);
      const toNode = nodeById.get(e.toNode);
      if (!fromNode || !toNode) continue;
      // Edge.tsx (sibling A) computes default sides only when from/toSide
      // aren't explicitly stored. We mirror that here so the midpoint
      // matches what the user sees on screen.
      const fromSide = e.fromSide ?? "right";
      const toSide = e.toSide ?? "left";
      const from = anchorPosition(fromNode, fromSide);
      const to = anchorPosition(toNode, toSide);
      const { c1, c2 } = bezierControlPoints(from, to, fromSide, toSide);
      const midCanvas = bezierMidpoint(from, c1, c2, to);
      const midScreen = canvasToScreen(midCanvas, { x: vx, y: vy, zoom });
      out.push({ edgeId: e.id, x: midScreen.x, y: midScreen.y, label: e.label });
    }
    return out;
  }, [edges, nodeById, vx, vy, zoom]);

  const nodeRects: NodeRect[] = useMemo(() => {
    return nodes.map((n) => {
      const tl = canvasToScreen({ x: n.x, y: n.y }, { x: vx, y: vy, zoom });
      const br = canvasToScreen(
        { x: n.x + n.width, y: n.y + n.height },
        { x: vx, y: vy, zoom },
      );
      return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
    });
  }, [nodes, vx, vy, zoom]);

  // Window-level dblclick: prefer edge-midpoint targets. Skip if the click
  // fell inside a node card (let NodeOverlayLayer's dblclick win), or if
  // it's inside our own edit-mode textarea.
  useEffect(() => {
    const onDblClick = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest(".aim-edge-label__edit, .aim-edge-label")) {
          // dblclick inside a label badge → enter edit mode for that edge
          const labelEl = t.closest(".aim-edge-label") as HTMLElement | null;
          const id = labelEl?.getAttribute("data-edge-id");
          if (typeof id === "string" && id.length > 0) {
            e.preventDefault();
            setEditingId(id);
          }
          return;
        }
        // Skip inside any node overlay textarea / color picker
        if (
          t.closest(
            ".aim-node-overlay__edit, .aim-color-picker, .aim-island, .aim-chrome",
          )
        ) {
          return;
        }
      }
      // Skip when the click is inside a node rect — that's a card dblclick.
      const x = e.clientX;
      const y = e.clientY;
      for (const r of nodeRects) {
        if (
          x >= r.left &&
          x <= r.left + r.width &&
          y >= r.top &&
          y <= r.top + r.height
        ) {
          return;
        }
      }
      // Pick the nearest midpoint within the click radius.
      const r2 = EDGE_DBLCLICK_RADIUS_PX * EDGE_DBLCLICK_RADIUS_PX;
      let best: { id: string; d2: number } | null = null;
      for (const mp of midpoints) {
        const dx = mp.x - x;
        const dy = mp.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        if (!best || d2 < best.d2) best = { id: mp.edgeId, d2 };
      }
      if (best) {
        e.preventDefault();
        setEditingId(best.id);
      }
    };
    window.addEventListener("dblclick", onDblClick, true);
    return () => window.removeEventListener("dblclick", onDblClick, true);
  }, [midpoints, nodeRects]);

  const exitEdit = useCallback(() => setEditingId(null), []);

  return (
    <div
      className="aim-edge-label-layer"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 51,
      }}
      aria-hidden={false}
    >
      {midpoints.map((mp) => {
        const editing = editingId === mp.edgeId;
        const edge = edges.find((e) => e.id === mp.edgeId);
        if (!edge) return null;
        // Read mode: don't render anything if there's no label and we're
        // not editing. This keeps the visual layer clean.
        if (!editing && (!mp.label || mp.label.length === 0)) return null;
        return (
          <EdgeLabelBadge
            key={mp.edgeId}
            edge={edge}
            x={mp.x}
            y={mp.y}
            editing={editing}
            onExitEdit={exitEdit}
          />
        );
      })}
    </div>
  );
}

interface EdgeLabelBadgeProps {
  edge: Edge;
  /** Screen-space midpoint. */
  x: number;
  y: number;
  editing: boolean;
  onExitEdit: () => void;
}

function EdgeLabelBadge({ edge, x, y, editing, onExitEdit }: EdgeLabelBadgeProps) {
  const [draft, setDraft] = useState(edge.label ?? "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(edge.label ?? "");
    const t = setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.select();
    }, 0);
    return () => clearTimeout(t);
    // Intentionally not re-syncing on edge.label changes while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      // Drop the `label` key entirely. updateEdge({ label: undefined })
      // would keep the key as undefined under shallow merge, conflicting
      // with exactOptionalPropertyTypes. Mirror ColorPicker.pick's pattern.
      useEdges.setState((s) => ({
        edges: s.edges.map((e) => {
          if (e.id !== edge.id) return e;
          const { label: _label, ...rest } = e;
          void _label;
          return rest as typeof e;
        }),
      }));
    } else if (trimmed !== edge.label) {
      useEdges.getState().updateEdge(edge.id, { label: trimmed });
    }
    onExitEdit();
  }, [draft, edge.id, edge.label, onExitEdit]);

  const cancel = useCallback(() => {
    setDraft(edge.label ?? "");
    onExitEdit();
  }, [edge.label, onExitEdit]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && !e.shiftKey) {
      // For a small inline label, plain Enter commits — labels are usually
      // one line. Shift+Enter inserts a newline if the user really wants
      // a multi-line label.
      e.preventDefault();
      commit();
    }
  };

  return (
    <div
      className="aim-edge-label"
      data-edge-id={edge.id}
      style={{
        // Center the badge on the midpoint via translate. Keeps the inline
        // style minimal (no need to measure the badge width per render).
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
      }}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          className="aim-edge-label__edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          onContextMenu={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          rows={1}
          aria-label="Edge label"
        />
      ) : (
        <span className="aim-edge-label__text">{edge.label}</span>
      )}
    </div>
  );
}

export default EdgeLabelOverlayLayer;
