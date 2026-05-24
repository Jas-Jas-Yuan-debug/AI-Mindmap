// Zoom interactions for the Konva <Stage>: cursor-centered wheel zoom
// (which also covers Mac touchpad pinch, reported as ctrl+wheel), plus
// document-level keyboard shortcuts Cmd/Ctrl + =, Cmd/Ctrl + -, and
// Cmd/Ctrl + 0 (reset).
//
// All zoom math goes through `zoomAroundPoint` from canvas/layout.ts so
// the screen-anchor invariant is preserved exactly. Clamp is enforced
// at the store boundary (setViewport / setZoom both call clampZoom).

import { useCallback, useEffect } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { zoomAroundPoint } from "../layout.js";
import { useViewport } from "../../store/viewport.js";

/** Multiplier applied per wheel "tick" — small for smooth feel. */
const WHEEL_ZOOM_STEP = 0.0015;
/** Multiplier for one keyboard zoom-in / zoom-out keypress. */
const KEY_ZOOM_FACTOR = 1.25;

export interface ZoomHandlers {
  /**
   * Wheel handler for the cursor-centered zoom path (ctrl/meta + wheel,
   * which is also how the browser reports a Mac trackpad pinch). When
   * neither modifier is held the handler does nothing — usePan owns that
   * case. Returns `true` if it handled the event.
   */
  onWheel(e: KonvaEventObject<WheelEvent>): boolean;
}

export function useZoom(): ZoomHandlers {
  // Subscribing through getState() inside the callback avoids re-creating
  // the wheel handler on every viewport change (which would otherwise
  // fire on every wheel tick — a feedback loop).
  const onWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    const ev = e.evt;
    const isZoomGesture = ev.ctrlKey || ev.metaKey;
    if (!isZoomGesture) return false;
    ev.preventDefault();

    const { x, y, zoom, setViewport } = useViewport.getState();
    // deltaY > 0 → scroll down / pinch out → zoom out
    // deltaY < 0 → scroll up / pinch in  → zoom in
    // Exponential so doubling the delta doubles the log-zoom step.
    const factor = Math.exp(-ev.deltaY * WHEEL_ZOOM_STEP);
    const newZoom = zoom * factor;
    const screenAnchor = { x: ev.clientX, y: ev.clientY };
    const next = zoomAroundPoint({ x, y, zoom }, screenAnchor, newZoom);
    setViewport(next);
    return true;
  }, []);

  // Keyboard shortcuts — registered at the document level so they work
  // regardless of focus (as long as it's not inside an input). Zoom is
  // anchored at the viewport center for keyboard zoom since there's no
  // cursor to anchor on.
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isTypingTarget(e.target)) return;
      // Cmd/Ctrl + 0 → reset
      if (e.key === "0") {
        e.preventDefault();
        useViewport.getState().reset();
        return;
      }
      // Cmd/Ctrl + = (or shift-equals "+") → zoom in
      // Cmd/Ctrl + - → zoom out
      // Note: e.key is "+" on shift-equals and "=" without shift; both
      // are "zoom in". On most keyboards, Cmd+= and Cmd++ are both how
      // users mean "zoom in".
      let direction: 1 | -1 | 0 = 0;
      if (e.key === "=" || e.key === "+") direction = 1;
      else if (e.key === "-" || e.key === "_") direction = -1;
      if (direction === 0) return;
      e.preventDefault();

      const { x, y, zoom, setViewport } = useViewport.getState();
      const newZoom = direction === 1 ? zoom * KEY_ZOOM_FACTOR : zoom / KEY_ZOOM_FACTOR;
      // Anchor at the viewport center so keyboard zoom feels balanced.
      const center = {
        x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
        y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
      };
      const next = zoomAroundPoint({ x, y, zoom }, center, newZoom);
      setViewport(next);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { onWheel };
}

/** Step constants exported for tests. */
export const __test__ = { WHEEL_ZOOM_STEP, KEY_ZOOM_FACTOR };
