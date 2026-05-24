// Dev-only helper exposed on window as `__aimPushCards(n)`. Used to verify
// the Phase 2 exit criterion "create 100 cards, no visible lag during pan/
// zoom" by hand: open the app in dev mode, run `window.__aimPushCards(100)`
// in the DevTools console, then pan/zoom and confirm smoothness.
//
// Guarded by `import.meta.env.DEV` so the helper never ships in a
// production bundle (Vite tree-shakes the call when DEV is false).
//
// Layout: lay the cards out on a square-ish grid so they're visually
// distinguishable without overlapping. 240×80 cards with a 24px gap means
// 100 cards fit in roughly a 2640×1040 region — fits in one pannable view.

import { makeNodeId, useNodes, type TextNode } from "../store/nodes.js";

const CARD_W = 240;
const CARD_H = 80;
const GAP = 24;

/**
 * Append `n` placeholder TextNodes laid out in a grid. Returns the array
 * of ids that were added so a caller can clean up via `deleteNode` if
 * desired.
 */
export function pushCards(n: number): string[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const ids: string[] = [];
  const { addNode } = useNodes.getState();
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const node: TextNode = {
      id: makeNodeId(),
      type: "text",
      x: col * (CARD_W + GAP),
      y: row * (CARD_H + GAP),
      width: CARD_W,
      height: CARD_H,
      text: `Card ${i + 1}`,
    };
    addNode(node);
    ids.push(node.id);
  }
  return ids;
}

/**
 * Wire `pushCards` to `window.__aimPushCards` in dev builds only. Called
 * once at app startup from `main.tsx`.
 */
export function installDevHelpers(): void {
  if (!import.meta.env.DEV) return;
  // Cast through unknown to satisfy `Window` augmentation without a
  // global declaration block — the helper is dev-only, so a typed name
  // would leak into production typings.
  (window as unknown as Record<string, unknown>).__aimPushCards = pushCards;
}
