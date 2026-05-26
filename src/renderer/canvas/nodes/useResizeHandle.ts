// Pointer-driven resize for the 8 handles, shared by Text / Image / Group nodes.
//
// WHY (bug fix): the handles used to be Konva `draggable` Rects. On drag, Konva
// repositioned the handle to follow the cursor WHILE the store re-rendered it
// back to the freshly-computed corner every frame — the two positions fought,
// so the handle jittered/shook and the resize wouldn't settle (and on
// origin-shifting handles the node moved too). Driving the resize from the
// pointer with NON-draggable handles removes that feedback loop entirely.
//
// On handle mousedown we cancel bubbling (so no node-move / pan / lasso starts),
// capture() once (one undo step), and attach namespaced stage move listeners +
// window up/blur listeners (so a release outside the stage still cleans up).
// Each move reads the live pointer, computes the new geometry from the LIVE
// node, and writes it to the store. The handle Rect is re-rendered by React at
// the correct corner each frame — no Konva drag to fight it.

import type { KonvaEventObject } from "konva/lib/Node";
import { useNodes } from "../../store/nodes.js";
import { useViewport } from "../../store/viewport.js";
import { useHistory } from "../../store/history.js";
import {
  computeResize,
  type ComputeResizeOpts,
  type ResizeHandle,
  type ResizeNode,
  type ResizeResult,
} from "../interactions/resize.js";

export interface StartResizeOptions extends ComputeResizeOpts {
  /** Post-process the computed geometry (e.g. ImageNode aspect-lock). */
  transform?: (r: ResizeResult, live: ResizeNode) => ResizeResult;
  /** Run once when the gesture ends (e.g. GroupNode detaches escaped children). */
  onEnd?: () => void;
}

export function startHandleResize(
  handle: ResizeHandle,
  e: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>,
  nodeId: string,
  opts: StartResizeOptions = {},
): void {
  // Own the gesture: don't let the press start a node/group move, pan, or lasso.
  e.cancelBubble = true;
  const stage = e.target.getStage();
  if (!stage || typeof window === "undefined") return;

  // One undo step for the whole resize.
  useHistory.getState().capture();

  const apply = () => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const v = useViewport.getState();
    const cursor = { x: (pointer.x - v.x) / v.zoom, y: (pointer.y - v.y) / v.zoom };
    const live = useNodes.getState().nodes.find((n) => n.id === nodeId);
    if (!live) return;
    let r = computeResize(handle, live, cursor, opts);
    if (opts.transform) r = opts.transform(r, live);
    useNodes
      .getState()
      .resizeNode(
        nodeId,
        Math.round(r.width),
        Math.round(r.height),
        r.x !== undefined ? Math.round(r.x) : undefined,
        r.y !== undefined ? Math.round(r.y) : undefined,
      );
  };

  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    stage.off(".aimresize");
    window.removeEventListener("mouseup", end);
    window.removeEventListener("touchend", end);
    window.removeEventListener("blur", end);
    opts.onEnd?.();
  };

  stage.on("mousemove.aimresize touchmove.aimresize", apply);
  window.addEventListener("mouseup", end);
  window.addEventListener("touchend", end);
  window.addEventListener("blur", end);
}
