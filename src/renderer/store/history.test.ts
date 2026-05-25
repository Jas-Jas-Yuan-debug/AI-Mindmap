// Unit tests for the Zustand history slice (Phase 4 PR 1).
//
// We don't render React — the history store and the nodes/edges stores it
// snapshots are all plain Zustand stores driven via getState(). We manipulate
// `useNodes` / `useEdges` directly to set up document state, then exercise
// capture / undo / redo / transact / cap behavior.
//
// Each test resets all three stores at setup so state doesn't leak.

import { beforeEach, describe, expect, test } from "vitest";
import { useNodes, type TextNode } from "./nodes.js";
import { useEdges, type Edge } from "./edges.js";
import { useHistory } from "./history.js";

const makeTextNode = (overrides: Partial<TextNode> = {}): TextNode => ({
  id: overrides.id ?? "n1",
  type: "text",
  x: overrides.x ?? 0,
  y: overrides.y ?? 0,
  width: overrides.width ?? 200,
  height: overrides.height ?? 80,
  text: overrides.text ?? "",
  ...overrides,
});

const makeEdge = (overrides: Partial<Edge> = {}): Edge => ({
  id: overrides.id ?? "e1",
  fromNode: overrides.fromNode ?? "a",
  toNode: overrides.toNode ?? "b",
  ...overrides,
});

beforeEach(() => {
  useNodes.setState({ nodes: [] });
  useEdges.setState({ edges: [] });
  useHistory.getState().clear();
});

describe("useHistory — initial state", () => {
  test("starts with empty past and future", () => {
    expect(useHistory.getState().past).toEqual([]);
    expect(useHistory.getState().future).toEqual([]);
  });
});

describe("capture + undo", () => {
  test("undo restores the prior nodes after a capture", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a", text: "one" })] });

    // Capture pre-mutation, then mutate.
    useHistory.getState().capture();
    useNodes.getState().addNode(makeTextNode({ id: "b", text: "two" }));
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a", "b"]);

    useHistory.getState().undo();
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a"]);
  });

  test("undo restores the prior edges as well as nodes", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a" })] });
    useEdges.setState({ edges: [makeEdge({ id: "e1" })] });

    useHistory.getState().capture();
    useEdges.getState().addEdge(makeEdge({ id: "e2", fromNode: "a", toNode: "c" }));
    useNodes.getState().deleteNode("a");

    expect(useEdges.getState().edges.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(useNodes.getState().nodes).toHaveLength(0);

    useHistory.getState().undo();
    expect(useEdges.getState().edges.map((e) => e.id)).toEqual(["e1"]);
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a"]);
  });

  test("undo with empty past is a no-op (does not throw, leaves doc alone)", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a" })] });
    expect(() => useHistory.getState().undo()).not.toThrow();
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a"]);
    expect(useHistory.getState().past).toEqual([]);
    expect(useHistory.getState().future).toEqual([]);
  });
});

describe("redo", () => {
  test("redo re-applies an undone mutation", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a" })] });
    useHistory.getState().capture();
    useNodes.getState().addNode(makeTextNode({ id: "b" }));

    useHistory.getState().undo();
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a"]);

    useHistory.getState().redo();
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("redo with empty future is a no-op", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a" })] });
    expect(() => useHistory.getState().redo()).not.toThrow();
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a"]);
  });

  test("undo then redo round-trips both stores exactly", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a", x: 1 })] });
    useEdges.setState({ edges: [] });

    useHistory.getState().capture();
    useNodes.getState().moveNode("a", 99, 99);
    useEdges.getState().addEdge(makeEdge({ id: "e1" }));

    const afterNodes = useNodes.getState().nodes;
    const afterEdges = useEdges.getState().edges;

    useHistory.getState().undo();
    useHistory.getState().redo();

    expect(useNodes.getState().nodes).toEqual(afterNodes);
    expect(useEdges.getState().edges).toEqual(afterEdges);
  });

  test("multi-level undo/redo walks the stack correctly", () => {
    useNodes.setState({ nodes: [] });
    useHistory.getState().capture();
    useNodes.getState().addNode(makeTextNode({ id: "a" }));
    useHistory.getState().capture();
    useNodes.getState().addNode(makeTextNode({ id: "b" }));
    useHistory.getState().capture();
    useNodes.getState().addNode(makeTextNode({ id: "c" }));

    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);

    useHistory.getState().undo(); // -> a,b
    useHistory.getState().undo(); // -> a
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a"]);

    useHistory.getState().redo(); // -> a,b
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a", "b"]);
    useHistory.getState().redo(); // -> a,b,c
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("future is cleared on a fresh capture", () => {
  test("a new capture after undo clears the redo stack", () => {
    useNodes.setState({ nodes: [] });
    useHistory.getState().capture();
    useNodes.getState().addNode(makeTextNode({ id: "a" }));

    useHistory.getState().undo(); // future now has 1 entry
    expect(useHistory.getState().future).toHaveLength(1);

    // A fresh action captures + clears future — can't redo to the old branch.
    useHistory.getState().capture();
    useNodes.getState().addNode(makeTextNode({ id: "z" }));
    expect(useHistory.getState().future).toEqual([]);

    useHistory.getState().redo(); // no-op now
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["z"]);
  });
});

describe("transact", () => {
  test("groups multiple mutations into a single undo step", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a" })] });
    useEdges.setState({ edges: [makeEdge({ id: "e1" })] });

    useHistory.getState().transact(() => {
      useNodes.getState().deleteNode("a");
      useEdges.getState().deleteEdge("e1");
      useNodes.getState().addNode(makeTextNode({ id: "b" }));
    });

    // Exactly one entry pushed for the whole transaction.
    expect(useHistory.getState().past).toHaveLength(1);
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["b"]);
    expect(useEdges.getState().edges).toHaveLength(0);

    // One undo restores the entire pre-transaction document.
    useHistory.getState().undo();
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["a"]);
    expect(useEdges.getState().edges.map((e) => e.id)).toEqual(["e1"]);
  });

  test("nested transact still produces only one undo step", () => {
    useNodes.setState({ nodes: [] });
    useHistory.getState().transact(() => {
      useNodes.getState().addNode(makeTextNode({ id: "a" }));
      useHistory.getState().transact(() => {
        useNodes.getState().addNode(makeTextNode({ id: "b" }));
      });
    });
    expect(useHistory.getState().past).toHaveLength(1);
    useHistory.getState().undo();
    expect(useNodes.getState().nodes).toHaveLength(0);
  });

  test("a capture() inside transact does not add an extra entry", () => {
    useNodes.setState({ nodes: [] });
    useHistory.getState().transact(() => {
      useNodes.getState().addNode(makeTextNode({ id: "a" }));
      // A retrofitted mutation site might call capture(); inside a txn it
      // must be suppressed.
      useHistory.getState().capture();
      useNodes.getState().addNode(makeTextNode({ id: "b" }));
    });
    expect(useHistory.getState().past).toHaveLength(1);
  });

  test("transact resets depth even when fn throws", () => {
    useNodes.setState({ nodes: [] });
    expect(() =>
      useHistory.getState().transact(() => {
        useNodes.getState().addNode(makeTextNode({ id: "a" }));
        throw new Error("boom");
      }),
    ).toThrow("boom");

    // Depth must have been decremented in `finally`; a subsequent capture
    // must work normally (it's NOT swallowed as if still inside a txn).
    useHistory.getState().capture();
    useNodes.getState().addNode(makeTextNode({ id: "b" }));
    expect(useHistory.getState().past).toHaveLength(2);
  });
});

describe("cap", () => {
  test("past is capped at 200 entries after 250 captures", () => {
    for (let i = 0; i < 250; i++) {
      useHistory.getState().capture();
      useNodes.getState().addNode(makeTextNode({ id: `n${i}` }));
    }
    expect(useHistory.getState().past).toHaveLength(200);
  });

  test("the cap drops the OLDEST entries (most recent 200 kept)", () => {
    // Snapshot count after capture i reflects i nodes already present.
    for (let i = 0; i < 250; i++) {
      useHistory.getState().capture();
      useNodes.getState().addNode(makeTextNode({ id: `n${i}` }));
    }
    // Doc now has 250 nodes. past[199] is the most recent snapshot, taken
    // right before adding n249 — so it should hold 249 nodes.
    const past = useHistory.getState().past;
    expect(past[past.length - 1]!.nodes).toHaveLength(249);
    // The oldest retained snapshot is the one taken before adding n50 (the
    // first 50 captures were dropped), so it holds 50 nodes.
    expect(past[0]!.nodes).toHaveLength(50);
  });
});

describe("snapshot aliasing invariant", () => {
  test("undo restores the exact array instance that was captured", () => {
    const original = [makeTextNode({ id: "a" })];
    useNodes.setState({ nodes: original });

    useHistory.getState().capture();
    // Mutate via the store (allocates a NEW array — never touches `original`).
    useNodes.getState().addNode(makeTextNode({ id: "b" }));
    expect(useNodes.getState().nodes).not.toBe(original);

    useHistory.getState().undo();
    // The snapshot held the same `original` reference; restore swaps it back.
    expect(useNodes.getState().nodes).toBe(original);
  });
});

describe("clear", () => {
  test("clear empties both stacks", () => {
    useHistory.getState().capture();
    useNodes.getState().addNode(makeTextNode({ id: "a" }));
    useHistory.getState().undo();
    expect(useHistory.getState().future.length).toBeGreaterThan(0);

    useHistory.getState().clear();
    expect(useHistory.getState().past).toEqual([]);
    expect(useHistory.getState().future).toEqual([]);
  });
});
