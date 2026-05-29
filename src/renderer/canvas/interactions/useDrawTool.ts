// Pointer-driven creation for the V2 drawing tools, plus the eraser.
//
// One hook handles every "drag on the canvas to make a thing" gesture:
//   - shape  (rectangle / diamond / ellipse): drag a bounding box.
//   - linear (line / arrow):                   drag from start to end point.
//   - draw   (freehand):                       collect points along the drag.
//   - eraser:                                  delete any node under the pointer.
//
// Approach: create-then-live-update. On mousedown we addNode() a tiny seed node
// and then mutate its geometry every mousemove, so the user sees the shape grow
// under the cursor with no separate "ghost" layer. history.capture() runs once
// at gesture start, so the whole draw is a single undo step. On mouseup we
// normalize the geometry (origin = bbox top-left, points local to it) and, for
// one-shot tools (shape / linear), revert to the select tool — matching how
// text/group placement behaves. The draw + eraser tools stay armed for
// continuous use.
//
// Coordinates: points are stored LOCAL to the node origin (x,y), i.e. relative
// to the bounding-box top-left, matching the LinearNode/DrawNode contract.

import { useCallback, useRef } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { screenToCanvas } from "../layout.js";
import {
  makeNodeId,
  useNodes,
  type ShapeKind,
  type LinearKind,
} from "../../store/nodes.js";
import { useSelection } from "../../store/selection.js";
import { useViewport } from "../../store/viewport.js";
import { useHistory } from "../../store/history.js";
import { useTool, type Tool } from "../../store/tool.js";

/** Tools this hook owns. */
const DRAW_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
  "rectangle",
  "diamond",
  "ellipse",
  "line",
  "arrow",
  "draw",
  "eraser",
]);

/** Tools that revert to "select" after one shape (Excalidraw-style one-shot). */
const ONE_SHOT: ReadonlySet<Tool> = new Set<Tool>([
  "rectangle",
  "diamond",
  "ellipse",
  "line",
  "arrow",
]);

/** Min drag (canvas px) below which a shape is treated as a click → default size. */
const CLICK_THRESHOLD = 6;
const DEFAULT_SHAPE_W = 120;
const DEFAULT_SHAPE_H = 90;
/** Default stroke width tier for new linear / freehand marks. */
const DEFAULT_DRAW_STROKE = 2 as const;

export interface DrawToolHandlers {
  /** Returns true if a drawing tool claimed the mousedown (caller should bail). */
  onMouseDown(e: KonvaEventObject<MouseEvent>): boolean;
  onMouseMove(e: KonvaEventObject<MouseEvent>): void;
  onMouseUp(e: KonvaEventObject<MouseEvent>): void;
}

type GestureKind = "shape" | "linear" | "draw" | "eraser";

interface Gesture {
  kind: GestureKind;
  /** In-progress node id (shape / linear / draw). */
  nodeId?: string;
  /** Gesture start in canvas coords. */
  startX: number;
  startY: number;
  /** Absolute canvas points collected for draw / linear. */
  abs: number[];
  /** Eraser: ids already deleted this gesture; whether we've captured history. */
  erased: Set<string>;
  captured: boolean;
}

/** Bounding box of an even-length [x,y,...] point list (canvas coords). */
function bbox(abs: number[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < abs.length; i += 2) {
    const px = abs[i]!;
    const py = abs[i + 1]!;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { minX, minY, maxX, maxY };
}

/** Walk a Konva target's ancestor chain to the nearest node-bearing Group. */
function nodeIdAt(stage: Konva.Stage, ids: ReadonlySet<string>): string | null {
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  let shape: Konva.Node | null = stage.getIntersection(pointer);
  while (shape && shape !== stage) {
    const id = shape.id();
    if (id && ids.has(id)) return id;
    shape = shape.getParent();
  }
  return null;
}

export function useDrawTool(): DrawToolHandlers {
  const ref = useRef<Gesture | null>(null);

  const canvasPoint = (stage: Konva.Stage): { x: number; y: number } | null => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return screenToCanvas(pointer, useViewport.getState());
  };

  const onMouseDown = useCallback((e: KonvaEventObject<MouseEvent>): boolean => {
    const tool = useTool.getState().activeTool;
    if (!DRAW_TOOLS.has(tool)) return false;
    const stage = e.target.getStage();
    if (!stage) return false;
    const c = canvasPoint(stage);
    if (!c) return true; // claimed, but no usable pointer

    if (tool === "eraser") {
      const ids = new Set(useNodes.getState().nodes.map((n) => n.id));
      const gesture: Gesture = {
        kind: "eraser",
        startX: c.x,
        startY: c.y,
        abs: [],
        erased: new Set(),
        captured: false,
      };
      ref.current = gesture;
      const hit = nodeIdAt(stage, ids);
      if (hit) {
        useHistory.getState().capture();
        gesture.captured = true;
        useNodes.getState().deleteNode(hit);
        gesture.erased.add(hit);
      }
      return true;
    }

    // shape / linear / draw — seed a node and grow it during the drag.
    useHistory.getState().capture();
    const id = makeNodeId();
    const x = Math.round(c.x);
    const y = Math.round(c.y);

    if (tool === "rectangle" || tool === "diamond" || tool === "ellipse") {
      useNodes.getState().addNode({
        id,
        type: "shape",
        shape: tool as ShapeKind,
        x,
        y,
        width: 1,
        height: 1,
      });
      ref.current = { kind: "shape", nodeId: id, startX: c.x, startY: c.y, abs: [], erased: new Set(), captured: true };
      return true;
    }

    if (tool === "line" || tool === "arrow") {
      useNodes.getState().addNode({
        id,
        type: "linear",
        linear: tool as LinearKind,
        x,
        y,
        width: 0,
        height: 0,
        points: [0, 0, 0, 0],
        strokeWidth: DEFAULT_DRAW_STROKE,
      });
      ref.current = { kind: "linear", nodeId: id, startX: c.x, startY: c.y, abs: [c.x, c.y], erased: new Set(), captured: true };
      return true;
    }

    // draw (freehand)
    useNodes.getState().addNode({
      id,
      type: "draw",
      x,
      y,
      width: 0,
      height: 0,
      points: [0, 0],
      strokeWidth: DEFAULT_DRAW_STROKE,
    });
    ref.current = { kind: "draw", nodeId: id, startX: c.x, startY: c.y, abs: [c.x, c.y], erased: new Set(), captured: true };
    return true;
  }, []);

  const onMouseMove = useCallback((e: KonvaEventObject<MouseEvent>): void => {
    const g = ref.current;
    if (!g) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const c = canvasPoint(stage);
    if (!c) return;

    if (g.kind === "eraser") {
      const ids = new Set(useNodes.getState().nodes.map((n) => n.id));
      const hit = nodeIdAt(stage, ids);
      if (hit && !g.erased.has(hit)) {
        if (!g.captured) {
          useHistory.getState().capture();
          g.captured = true;
        }
        useNodes.getState().deleteNode(hit);
        g.erased.add(hit);
      }
      return;
    }

    if (g.kind === "shape" && g.nodeId) {
      const x = Math.round(Math.min(g.startX, c.x));
      const y = Math.round(Math.min(g.startY, c.y));
      const w = Math.max(1, Math.round(Math.abs(c.x - g.startX)));
      const h = Math.max(1, Math.round(Math.abs(c.y - g.startY)));
      useNodes.getState().resizeNode(g.nodeId, w, h, x, y);
      return;
    }

    if (g.kind === "linear" && g.nodeId) {
      // Keep origin at the start point; end point is local to it. Normalized on up.
      const lx = c.x - g.startX;
      const ly = c.y - g.startY;
      useNodes.getState().updateNode(g.nodeId, {
        points: [0, 0, Math.round(lx), Math.round(ly)],
        width: Math.round(Math.abs(lx)),
        height: Math.round(Math.abs(ly)),
      });
      return;
    }

    if (g.kind === "draw" && g.nodeId) {
      g.abs.push(c.x, c.y);
      const local: number[] = [];
      for (let i = 0; i + 1 < g.abs.length; i += 2) {
        local.push(Math.round(g.abs[i]! - g.startX), Math.round(g.abs[i + 1]! - g.startY));
      }
      const b = bbox(g.abs);
      useNodes.getState().updateNode(g.nodeId, {
        points: local,
        width: Math.round(b.maxX - b.minX),
        height: Math.round(b.maxY - b.minY),
      });
      return;
    }
  }, []);

  const onMouseUp = useCallback((): void => {
    const g = ref.current;
    ref.current = null;
    if (!g) return;
    const tool = useTool.getState().activeTool;

    const finish = () => {
      if (ONE_SHOT.has(tool)) useTool.getState().setTool("select");
    };

    if (g.kind === "eraser") return; // stays armed; nothing to finalize

    if (!g.nodeId) {
      finish();
      return;
    }
    const nodeId = g.nodeId;

    if (g.kind === "shape") {
      const live = useNodes.getState().nodes.find((n) => n.id === nodeId);
      if (live && (live.width < CLICK_THRESHOLD || live.height < CLICK_THRESHOLD)) {
        // A click without a real drag → place a default-size shape.
        useNodes.getState().resizeNode(nodeId, DEFAULT_SHAPE_W, DEFAULT_SHAPE_H, live.x, live.y);
      }
      useSelection.getState().set([nodeId]);
      finish();
      return;
    }

    if (g.kind === "linear") {
      // Drop a zero-length line (a click with no drag).
      const b = bbox(g.abs.length >= 2 ? g.abs : [g.startX, g.startY]);
      const endX = g.abs.length >= 4 ? g.abs[2]! : g.startX;
      const endY = g.abs.length >= 4 ? g.abs[3]! : g.startY;
      // abs only holds the start; reconstruct end from the live node.
      const live = useNodes.getState().nodes.find((n) => n.id === nodeId);
      const ex = live && live.type === "linear" && live.points.length >= 4 ? g.startX + live.points[2]! : endX;
      const ey = live && live.type === "linear" && live.points.length >= 4 ? g.startY + live.points[3]! : endY;
      const minX = Math.min(g.startX, ex);
      const minY = Math.min(g.startY, ey);
      const w = Math.abs(ex - g.startX);
      const h = Math.abs(ey - g.startY);
      if (w < CLICK_THRESHOLD && h < CLICK_THRESHOLD) {
        useNodes.getState().deleteNode(nodeId);
        finish();
        return;
      }
      void b;
      useNodes.getState().updateNode(nodeId, {
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.round(w),
        height: Math.round(h),
        points: [
          Math.round(g.startX - minX),
          Math.round(g.startY - minY),
          Math.round(ex - minX),
          Math.round(ey - minY),
        ],
      });
      useSelection.getState().set([nodeId]);
      finish();
      return;
    }

    // draw: normalize origin to bbox top-left; stays armed for continuous use.
    const b = bbox(g.abs);
    if (!isFinite(b.minX)) {
      finish();
      return;
    }
    const local: number[] = [];
    for (let i = 0; i + 1 < g.abs.length; i += 2) {
      local.push(Math.round(g.abs[i]! - b.minX), Math.round(g.abs[i + 1]! - b.minY));
    }
    useNodes.getState().updateNode(nodeId, {
      x: Math.round(b.minX),
      y: Math.round(b.minY),
      width: Math.round(b.maxX - b.minX),
      height: Math.round(b.maxY - b.minY),
      points: local.length >= 2 ? local : [0, 0],
    });
    useSelection.getState().set([nodeId]);
  }, []);

  return { onMouseDown, onMouseMove, onMouseUp };
}
