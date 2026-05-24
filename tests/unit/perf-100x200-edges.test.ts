// Phase 3 §6 exit criterion 1: "100 cards × 200 edges renders at 60fps
// during pan/zoom."
//
// This test is a *machinery proxy* for that criterion — same approach as
// `perf-100-cards.test.ts`. The actual "60fps during pan/zoom" check is
// performed manually via the `window.__aimPushCards(100)` +
// `window.__aimPushEdges(200)` dev helpers; this test guards the store
// layer against O(n²) regressions so the renderer's job is the only
// remaining cost.
//
// What we measure:
//   1. Time to insert 100 nodes + 200 edges back-to-back. Asserted under
//      500ms — a generous CI-noise budget. Anything significantly higher
//      indicates an accidental quadratic in the store path.
//   2. A single `updateNode` after the setup completes in under 10ms.
//      This catches the case where a future change makes node mutations
//      O(edges) (e.g. computing edge endpoints inside the node slice).
//   3. A single `deleteNodeAndEdges` after the setup. This must remain
//      O(edges) (one pass to find incident edges) — if it accidentally
//      becomes O(edges²) the assert will flag it.

import { afterEach, describe, expect, test } from "vitest";
import {
  deleteNodeAndEdges,
  makeEdgeId,
  useEdges,
} from "../../src/renderer/store/edges.js";
import { makeNodeId, useNodes } from "../../src/renderer/store/nodes.js";

const NODES = 100;
const EDGES = 200;

afterEach(() => {
  // Reset both stores between tests so the next test starts from empty.
  useNodes.setState({ nodes: [] });
  useEdges.setState({ edges: [] });
});

function seedGrid(): string[] {
  const ids: string[] = [];
  const cols = Math.ceil(Math.sqrt(NODES));
  const { addNode } = useNodes.getState();
  for (let i = 0; i < NODES; i++) {
    const id = makeNodeId();
    ids.push(id);
    const col = i % cols;
    const row = Math.floor(i / cols);
    addNode({
      id,
      type: "text",
      x: col * 264,
      y: row * 104,
      width: 240,
      height: 80,
      text: `Card ${i + 1}`,
    });
  }
  return ids;
}

function seedEdges(nodeIds: string[]): string[] {
  const ids: string[] = [];
  const { addEdge } = useEdges.getState();
  for (let i = 0; i < EDGES; i++) {
    const fromIdx = i % nodeIds.length;
    // Spread the toIdx so neighbours aren't always linear — better
    // approximation of a real mind-map.
    const toIdx = (fromIdx + 1 + ((i * 7) % (nodeIds.length - 1))) % nodeIds.length;
    const id = makeEdgeId();
    ids.push(id);
    addEdge({
      id,
      fromNode: nodeIds[fromIdx]!,
      toNode: nodeIds[toIdx]!,
    });
  }
  return ids;
}

describe("perf: 100×200 store insertion (Phase 3 exit criterion)", () => {
  test(`adding ${NODES} nodes + ${EDGES} edges completes well under the budget`, () => {
    const start = performance.now();
    const ids = seedGrid();
    seedEdges(ids);
    const elapsed = performance.now() - start;
    expect(useNodes.getState().nodes.length).toBe(NODES);
    expect(useEdges.getState().edges.length).toBe(EDGES);
    // 500ms is far above realistic numbers (sub-50ms on CI), but it's the
    // budget that lets us catch an O(n²) regression without flaking on a
    // slow shared runner.
    expect(elapsed).toBeLessThan(500);
  });

  test(`a single node update at scale stays fast`, () => {
    const ids = seedGrid();
    seedEdges(ids);
    const first = ids[0]!;
    const start = performance.now();
    useNodes.getState().updateNode(first, { x: 999 });
    const elapsed = performance.now() - start;
    // Node update must stay O(nodes), independent of edge count. 10ms is
    // a generous CI-noise budget; the real number is sub-millisecond.
    expect(elapsed).toBeLessThan(10);
    const moved = useNodes.getState().nodes.find((n) => n.id === first);
    expect(moved?.x).toBe(999);
  });

  test(`cascade-deleting one node + its incident edges stays under budget`, () => {
    const ids = seedGrid();
    seedEdges(ids);
    const target = ids[0]!;
    const incidentBefore = useEdges
      .getState()
      .edges.filter((e) => e.fromNode === target || e.toNode === target).length;
    const start = performance.now();
    deleteNodeAndEdges(target);
    const elapsed = performance.now() - start;
    // Cascade is O(nodes + edges). 20ms is comfortably above the real cost.
    expect(elapsed).toBeLessThan(20);
    // Node is gone.
    expect(useNodes.getState().nodes.find((n) => n.id === target)).toBeUndefined();
    // All incident edges are gone.
    expect(
      useEdges
        .getState()
        .edges.filter((e) => e.fromNode === target || e.toNode === target).length,
    ).toBe(0);
    // We expected to drop `incidentBefore` edges total.
    expect(useEdges.getState().edges.length).toBe(EDGES - incidentBefore);
  });
});
