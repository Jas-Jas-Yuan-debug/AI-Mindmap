// Pan interactions for the Konva <Stage>: mouse drag on empty space,
// two-finger touchpad scroll, and spacebar-held drag.
//
// The hook returns Konva event handlers plus a `cursor` string that the
// Canvas should apply to the Stage's container. Pan changes only
// viewport.x / viewport.y via `panBy`; zoom is untouched.
//
// Design notes:
//   - We treat a "primary mouse button drag whose target is the Stage
//     itself" as a pan. Once Phase 2 lands nodes, that target check is
//     what stops node-drags from triggering a pan.
//   - Spacebar tracking lives at the document level (Excalidraw-style),
//     so we can flip the cursor to `grab` even before the user clicks.
//   - Two-finger touchpad scroll arrives as a `wheel` event WITHOUT
//     ctrlKey/metaKey. ctrl/meta + wheel is pinch-zoom (handled in
//     useZoom). This hook only consumes the pan case.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { useViewport } from "../../store/viewport.js";

export interface PanHandlers {
  /** Cursor string to apply to the Stage container. */
  cursor: "default" | "grab" | "grabbing";
  /** Whether a pan drag is currently active. */
  isPanning: boolean;

  onMouseDown(e: KonvaEventObject<MouseEvent>): void;
  onMouseMove(e: KonvaEventObject<MouseEvent>): void;
  onMouseUp(e: KonvaEventObject<MouseEvent>): void;
  onMouseLeave(e: KonvaEventObject<MouseEvent>): void;
  /**
   * Wheel handler that ONLY handles the pan case (plain wheel, no
   * ctrl/meta). When ctrl/meta is held, we don't touch the viewport here
   * — useZoom owns that path. Returning `true` means "handled".
   */
  onWheel(e: KonvaEventObject<WheelEvent>): boolean;
}

export function usePan(): PanHandlers {
  const panBy = useViewport((s) => s.panBy);

  // Track spacebar at the document level so the cursor can preview
  // "grab" before the user starts dragging.
  const [spaceHeld, setSpaceHeld] = useState(false);
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
      if (e.code !== "Space") return;
      if (isTypingTarget(e.target)) return;
      // Prevent space-scrolls-the-page while we're using it for pan.
      e.preventDefault();
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      setSpaceHeld(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Drag state — kept in a ref so handlers don't re-render on every move.
  const dragRef = useRef<{
    active: boolean;
    lastClientX: number;
    lastClientY: number;
  }>({ active: false, lastClientX: 0, lastClientY: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const onMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      // Only left button.
      if (e.evt.button !== 0) return;
      // Pan when:
      //   (a) the click target is the Stage itself (empty space), OR
      //   (b) spacebar is held — Excalidraw-style "hand tool" override.
      const target = e.target;
      const stage = e.target.getStage();
      const onEmpty = target === stage;
      if (!onEmpty && !spaceHeld) return;
      dragRef.current = {
        active: true,
        lastClientX: e.evt.clientX,
        lastClientY: e.evt.clientY,
      };
      setIsPanning(true);
    },
    [spaceHeld],
  );

  const onMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const drag = dragRef.current;
      if (!drag.active) return;
      const dx = e.evt.clientX - drag.lastClientX;
      const dy = e.evt.clientY - drag.lastClientY;
      drag.lastClientX = e.evt.clientX;
      drag.lastClientY = e.evt.clientY;
      if (dx !== 0 || dy !== 0) panBy(dx, dy);
    },
    [panBy],
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsPanning(false);
  }, []);

  const onMouseUp = useCallback(() => endDrag(), [endDrag]);
  const onMouseLeave = useCallback(() => endDrag(), [endDrag]);

  const onWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      // ctrl/meta + wheel is pinch-zoom (browser convention) — not ours.
      if (e.evt.ctrlKey || e.evt.metaKey) return false;
      // Touchpad two-finger scroll (and conventional wheel) → pan.
      // Prevent the browser from scrolling the page underneath.
      e.evt.preventDefault();
      const dx = e.evt.deltaX;
      const dy = e.evt.deltaY;
      if (dx !== 0 || dy !== 0) panBy(-dx, -dy);
      return true;
    },
    [panBy],
  );

  const cursor: PanHandlers["cursor"] = isPanning
    ? "grabbing"
    : spaceHeld
      ? "grab"
      : "default";

  return {
    cursor,
    isPanning,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onWheel,
  };
}
