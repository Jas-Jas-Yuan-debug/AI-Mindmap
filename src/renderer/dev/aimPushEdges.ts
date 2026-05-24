// Dev-only helper exposed on window as `__aimPushEdges(n)`. Companion to
// `aimPushCards.ts` for the Phase 3 §6 exit criterion "100 cards × 200
// edges renders at 60fps during pan/zoom". The expected manual workflow
// is:
//
//   1. open the app in dev mode
//   2. `window.__aimPushCards(100)` — populate the canvas with cards
//   3. `window.__aimPushEdges(200)` — connect them with random edges
//   4. pan/zoom and confirm smoothness by eye
//
// Guarded by `import.meta.env.DEV` so the helper never ships in a
// production bundle (Vite tree-shakes the call when DEV is false).
//
// Edge layout: pick two distinct nodes uniformly at random per edge.
// We don't dedupe (two edges between the same pair are allowed — it's
// rarely a real user scenario but mirrors what the renderer must handle
// at the limit).

import { useEdges, makeEdgeId, type Edge } from "../store/edges.js";
import { useNodes } from "../store/nodes.js";

/**
 * Append `n` random edges between the existing nodes. Returns the array
 * of edge ids that were added. No-op (returns []) when fewer than 2 nodes
 * exist — an edge requires distinct endpoints.
 */
export function pushEdges(n: number): string[] {
  const nodes = useNodes.getState().nodes;
  if (nodes.length < 2) return [];

  const { addEdge } = useEdges.getState();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const fromIdx = Math.floor(Math.random() * nodes.length);
    let toIdx = Math.floor(Math.random() * nodes.length);
    // Ensure distinct endpoints. With > 1 node available, at most one
    // re-roll is needed in the worst case to land on a different index.
    if (toIdx === fromIdx) {
      toIdx = (toIdx + 1) % nodes.length;
    }
    const fromNode = nodes[fromIdx]!;
    const toNode = nodes[toIdx]!;
    const edge: Edge = {
      id: makeEdgeId(),
      fromNode: fromNode.id,
      toNode: toNode.id,
    };
    addEdge(edge);
    ids.push(edge.id);
  }
  return ids;
}

/**
 * Wire `pushEdges` to `window.__aimPushEdges` in dev builds only. Called
 * once at app startup from `main.tsx`.
 */
export function installEdgeDevHelpers(): void {
  if (!import.meta.env.DEV) return;
  (window as unknown as Record<string, unknown>).__aimPushEdges = pushEdges;
}
