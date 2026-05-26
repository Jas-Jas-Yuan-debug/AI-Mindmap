// Window-level double-click → open-URL handler for LinkNodes (sibling D).
//
// This component renders NOTHING. It exists purely to install a reliable
// dblclick path for link nodes, matching the mechanism every other dblclick
// affordance in the app already uses (NodeOverlayLayer for text edit,
// GroupOverlayLayer for label edit, EdgeLabelOverlayLayer for edge labels).
//
// Why a window-level DOM listener instead of the Konva Group's `onDblClick`:
//   A Konva Group with `draggable` fires `dblclick` only when two clicks land
//   on the same shape with NO intervening drag. A real double-click almost
//   always nudges the pointer a pixel or two between clicks, which Konva
//   interprets as a (zero-distance) drag and uses to reset its click pairing —
//   so the Group's `onDblClick` silently never fires. That was the root cause
//   of "double-clicking a link node does nothing". The DOM `dblclick` event,
//   by contrast, fires regardless of Konva's internal drag bookkeeping.
//
// Coordination with the other overlay layers:
//   - We hit-test ONLY link-node rects, so a dblclick on a text card / group /
//     edge / empty canvas is ignored here and handled by its owner.
//   - We bail when the target is inside any HTML overlay (textarea, color
//     picker, chrome island) so editing UIs aren't disturbed.
//   - On a hit we open the URL and `preventDefault()` so the empty-canvas
//     create-on-dblclick (Canvas `useCreate`) never also fires.

import { useEffect, useMemo } from "react";
import { useNodes, type AimapNode, type LinkNode } from "../store/nodes.js";
import { useViewport } from "../store/viewport.js";
import { canvasToScreen } from "../canvas/layout.js";
import { openLinkUrl } from "../canvas/nodes/openLink.js";

interface LinkRect {
  id: string;
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

function isLinkNode(n: AimapNode): n is LinkNode {
  return n.type === "link";
}

/** Topmost-wins hit test (array tail renders on top in Konva z-order). */
function hitTest(rects: LinkRect[], x: number, y: number): LinkRect | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i]!;
    if (x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height) {
      return r;
    }
  }
  return null;
}

export function LinkOverlayLayer() {
  const allNodes = useNodes((s) => s.nodes);
  const vx = useViewport((s) => s.x);
  const vy = useViewport((s) => s.y);
  const zoom = useViewport((s) => s.zoom);

  const links = useMemo(() => allNodes.filter(isLinkNode), [allNodes]);

  const rects: LinkRect[] = useMemo(() => {
    return links.map((node) => {
      const tl = canvasToScreen({ x: node.x, y: node.y }, { x: vx, y: vy, zoom });
      const br = canvasToScreen(
        { x: node.x + node.width, y: node.y + node.height },
        { x: vx, y: vy, zoom },
      );
      return {
        id: node.id,
        url: node.url,
        left: tl.x,
        top: tl.y,
        width: br.x - tl.x,
        height: br.y - tl.y,
      };
    });
  }, [links, vx, vy, zoom]);

  useEffect(() => {
    const onDblClick = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        // Never hijack a dblclick inside an editing surface or the chrome.
        if (
          t.closest(
            ".aim-node-overlay__edit, .aim-edge-label__edit, .aim-group-label__edit, .aim-color-picker, .aim-island, .aim-chrome",
          )
        ) {
          return;
        }
      }
      const hit = hitTest(rects, e.clientX, e.clientY);
      if (!hit) return;
      // Stop Canvas's create-on-dblclick from also firing on this gesture.
      e.preventDefault();
      e.stopPropagation();
      openLinkUrl(hit.url);
    };
    window.addEventListener("dblclick", onDblClick, true);
    return () => window.removeEventListener("dblclick", onDblClick, true);
  }, [rects]);

  return null;
}

export default LinkOverlayLayer;
