// Phase 4 lasso (marquee) selection hook.
//
// Behaviour: a plain left-button drag starting on EMPTY canvas (target ===
// stage) sweeps out a rectangle; on release, every node whose AABB overlaps
// the rectangle becomes the selection (replacing the prior selection).
//
// Coexistence with the other empty-canvas gestures — this is the whole
// reason the guards are spelled out so carefully:
//   - PAN is space-held drag (Excalidraw hand tool) OR two-finger wheel. We
//     mirror usePan's negative guard: if spacebar is held we do NOT start a
//     lasso, we let usePan own the gesture. (usePan only pans on empty space
//     OR when space is held; on empty space WITHOUT space, BOTH usePan and
//     useLasso would otherwise fire — see Canvas.tsx composition note.)
//   - CREATE is dblclick — a distinct event from mousedown/move/up, so it
//     never collides with a single-click drag.
//   - DRAW-EDGE claims the gesture from an anchor dot (target is the anchor),
//     which is not the stage, so the lasso's `target === stage` guard skips
//     it. Canvas.tsx also lets draw.onMouseDown run first and short-circuit.
//
// Composition contract (see Canvas.tsx): the hook exposes onMouseDown/Move/Up
// returning void; Canvas calls them in its existing Stage handlers. The
// in-flight rect is exposed via a render-subscribed value so <LassoLayer> can
// draw it. We keep the live drag in a ref (no re-render per move) and publish
// to state only at a throttle granularity Konva already coalesces (one set
// per move event is fine — it's one shallow object).
//
// Spacebar tracking is duplicated from usePan rather than shared: usePan does
// not export its spaceHeld, and a tiny document-level listener is cheaper than
// threading a new prop through Canvas. Both listeners no-op when typing.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { useNodes } from "../../store/nodes.js";
import { useSelection } from "../../store/selection.js";
import { useViewport } from "../../store/viewport.js";
import { useTool } from "../../store/tool.js";
import { screenToCanvas } from "../layout.js";
import { normalizeLasso, nodesInLasso, type Rect } from "./lasso.js";

export interface LassoHandlers {
  /** The current lasso rect in canvas space, or null when not dragging. */
  rect: Rect | null;
  /**
   * Returns `true` when it claimed the gesture (started a lasso), mirroring
   * `useDrawEdge.onMouseDown`. Canvas.tsx uses this to suppress pan +
   * empty-canvas-clear for the duration of a lasso drag, so the marquee
   * doesn't also pan the viewport.
   */
  onMouseDown(e: KonvaEventObject<MouseEvent>): boolean;
  onMouseMove(e: KonvaEventObject<MouseEvent>): void;
  onMouseUp(e: KonvaEventObject<MouseEvent>): void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useLasso(): LassoHandlers {
  // Spacebar = pan override; while held we must NOT start a lasso.
  const spaceHeldRef = useRef(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isTypingTarget(e.target)) return;
      spaceHeldRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceHeldRef.current = false;
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Live drag in a ref so move events don't trigger React re-renders beyond
  // the one we explicitly publish for the visible rectangle.
  const dragRef = useRef<{ active: boolean; startX: number; startY: number }>({
    active: false,
    startX: 0,
    startY: 0,
  });
  const [rect, setRect] = useState<Rect | null>(null);

  const onMouseDown = useCallback((e: KonvaEventObject<MouseEvent>): boolean => {
    if (e.evt.button !== 0) return false; // left button only
    if (spaceHeldRef.current) return false; // space-drag is pan, not lasso
    const stage = e.target.getStage();
    if (!stage) return false;
    if (e.target !== stage) return false; // only on empty canvas
    const pointer = stage.getPointerPosition();
    if (!pointer) return false;
    const v = useViewport.getState();
    const start = screenToCanvas(pointer, v);
    dragRef.current = { active: true, startX: start.x, startY: start.y };
    setRect({ x: start.x, y: start.y, width: 0, height: 0 });
    return true;
  }, []);

  const onMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const v = useViewport.getState();
    const cur = screenToCanvas(pointer, v);
    setRect(
      normalizeLasso({
        x1: drag.startX,
        y1: drag.startY,
        x2: cur.x,
        y2: cur.y,
      }),
    );
  }, []);

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag.active) return;
    drag.active = false;
    // Commit selection from the final rect. Reading the latest `rect` from
    // the state setter avoids a stale closure.
    setRect((finalRect) => {
      if (finalRect) {
        const targets = useNodes.getState().nodes;
        const ids = nodesInLasso(targets, finalRect);
        // Replace selection wholesale. An empty lasso (no hits, e.g. a tiny
        // accidental drag) clears selection — matching Excalidraw, where a
        // marquee over empty space deselects.
        useSelection.getState().set(ids);
      }
      return null; // hide the rectangle
    });
    // One-shot for the explicit marquee/box-select tool: once a marquee
    // commits, drop back to the select tool so the user can immediately drag
    // / edit the freshly-selected nodes (matches Excalidraw, and mirrors the
    // text/group placement tools' one-shot revert). The default select tool
    // is unaffected — it stays select-mode for repeated marquees.
    if (useTool.getState().activeTool === "marquee") {
      useTool.getState().setTool("select");
    }
  }, []);

  return { rect, onMouseDown, onMouseMove, onMouseUp };
}
