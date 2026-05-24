// Phase 2 §6 exit criterion 1: "Create 100 cards, no visible lag during
// pan/zoom."
//
// This test is a *machinery proxy* for that criterion — it checks the
// underlying store layer is fast enough that the renderer's job
// (rendering 100 cards with Konva) is the only remaining cost. The real
// "no visible lag" check is a manual one performed by the user via the
// `window.__aimPushCards(100)` dev helper.
//
// What we measure: time to insert 100 nodes via `useNodes.addNode`, plus
// time to scan the resulting array. We assert generous budgets — the
// goal is to catch regressions where someone accidentally introduces an
// O(n^2) operation, not to flake CI on a slow shared runner.

import { afterEach, describe, expect, test } from "vitest";
import { makeNodeId, useNodes } from "../../src/renderer/store/nodes.js";

const N = 100;

afterEach(() => {
  useNodes.setState({ nodes: [] });
});

describe("perf: 100-card store insertion (Phase 2 exit criterion)", () => {
  test(`adding ${N} text nodes completes well under the budget`, () => {
    const start = performance.now();
    const { addNode } = useNodes.getState();
    for (let i = 0; i < N; i++) {
      addNode({
        id: makeNodeId(),
        type: "text",
        x: i * 10,
        y: i * 10,
        width: 240,
        height: 80,
        text: "",
      });
    }
    const elapsed = performance.now() - start;
    expect(useNodes.getState().nodes.length).toBe(N);
    // Generous budget — store mutations are cheap; if this fails it's
    // because someone introduced an O(n^2) path or a synchronous side
    // effect. 200ms gives plenty of headroom for CI noise without
    // hiding real regressions.
    expect(elapsed).toBeLessThan(200);
  });

  test(`bulk moveNode of all ${N} cards stays under budget`, () => {
    const { addNode, moveNode } = useNodes.getState();
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      const id = makeNodeId();
      ids.push(id);
      addNode({
        id,
        type: "text",
        x: 0,
        y: 0,
        width: 240,
        height: 80,
        text: "",
      });
    }
    const start = performance.now();
    for (const id of ids) {
      moveNode(id, 50, 60);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
    // Final state correct.
    const allMoved = useNodes
      .getState()
      .nodes.every((n) => n.x === 50 && n.y === 60);
    expect(allMoved).toBe(true);
  });

  test(`deleting all ${N} cards leaves an empty store quickly`, () => {
    const { addNode, deleteNode } = useNodes.getState();
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      const id = makeNodeId();
      ids.push(id);
      addNode({
        id,
        type: "text",
        x: 0,
        y: 0,
        width: 240,
        height: 80,
        text: "",
      });
    }
    const start = performance.now();
    for (const id of ids) deleteNode(id);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(useNodes.getState().nodes.length).toBe(0);
  });
});
