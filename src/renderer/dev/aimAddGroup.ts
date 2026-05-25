// Dev-only helper exposed on window as `__aimAddGroup(x, y, w, h, label?)`.
// Used to manually verify the Phase 6 group container render + z-order (group
// paints behind nodes) and, later, sibling B's drag-in/out: open the app in
// dev mode, run e.g. `window.__aimAddGroup(0, 0, 360, 240, "Ideas")` in the
// DevTools console, then drag some text cards over it.
//
// Guarded by `import.meta.env.DEV` so the helper never ships in a production
// bundle (Vite tree-shakes the call when DEV is false), matching the existing
// `__aimPushCards` / `__aimPushEdges` helpers.

import { makeGroupId, useNodes, type GroupNode } from "../store/nodes.js";
import {
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
} from "../canvas/nodes/GroupNode.js";

/**
 * Add a single GroupNode at (x, y) with the given size and optional label.
 * Width/height are clamped to the group minimums. Returns the new group id.
 */
export function addGroup(
  x = 0,
  y = 0,
  width = GROUP_MIN_WIDTH,
  height = GROUP_MIN_HEIGHT,
  label?: string,
): string {
  const node: GroupNode = {
    id: makeGroupId(),
    type: "group",
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(GROUP_MIN_WIDTH, Math.round(width)),
    height: Math.max(GROUP_MIN_HEIGHT, Math.round(height)),
    ...(label !== undefined ? { label } : {}),
  };
  useNodes.getState().addNode(node);
  return node.id;
}

/**
 * Wire `addGroup` to `window.__aimAddGroup` in dev builds only. Called once at
 * app startup from `main.tsx`.
 */
export function installGroupDevHelpers(): void {
  if (!import.meta.env.DEV) return;
  (window as unknown as Record<string, unknown>).__aimAddGroup = addGroup;
}
