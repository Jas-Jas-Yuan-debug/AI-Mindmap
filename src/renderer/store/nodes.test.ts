// Unit tests for the Zustand nodes slice.
//
// We don't render any React here — Zustand stores are independent of the
// renderer, so we just drive `useNodes.getState()` directly. The file
// lives under `src/renderer/**` so vitest's envMatchGlobs sends it to
// jsdom; that's harmless (the store doesn't read window/document) but
// keeps the test colocated with the code it covers.
//
// Each test resets the store at setup so state doesn't leak across tests.

import { beforeEach, describe, expect, test } from "vitest";
import {
  type AimapNode,
  type TextNode,
  makeNodeId,
  useNodes,
} from "./nodes.js";

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

beforeEach(() => {
  useNodes.setState({ nodes: [] });
});

describe("useNodes — initial state", () => {
  test("starts with an empty nodes array", () => {
    expect(useNodes.getState().nodes).toEqual([]);
  });
});

describe("addNode", () => {
  test("appends a node to the array", () => {
    const n = makeTextNode({ id: "a" });
    useNodes.getState().addNode(n);
    expect(useNodes.getState().nodes).toEqual([n]);
  });

  test("preserves insertion order across multiple adds", () => {
    useNodes.getState().addNode(makeTextNode({ id: "a" }));
    useNodes.getState().addNode(makeTextNode({ id: "b" }));
    useNodes.getState().addNode(makeTextNode({ id: "c" }));
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("produces a new array reference on each add (so React re-renders)", () => {
    const before = useNodes.getState().nodes;
    useNodes.getState().addNode(makeTextNode({ id: "a" }));
    const after = useNodes.getState().nodes;
    expect(after).not.toBe(before);
  });
});

describe("updateNode", () => {
  test("shallow-merges the patch into the matching node", () => {
    useNodes.getState().addNode(makeTextNode({ id: "a", text: "hello" }));
    useNodes.getState().updateNode("a", { text: "world" });
    const updated = useNodes.getState().nodes[0] as TextNode;
    expect(updated.text).toBe("world");
    // Untouched fields are preserved.
    expect(updated.id).toBe("a");
    expect(updated.width).toBe(200);
  });

  test("is a no-op when the id is unknown (does not throw)", () => {
    useNodes.getState().addNode(makeTextNode({ id: "a" }));
    expect(() =>
      useNodes.getState().updateNode("does-not-exist", { x: 999 }),
    ).not.toThrow();
    // State unchanged.
    expect(useNodes.getState().nodes).toHaveLength(1);
    expect(useNodes.getState().nodes[0]?.id).toBe("a");
  });

  test("can set the optional color field", () => {
    useNodes.getState().addNode(makeTextNode({ id: "a" }));
    useNodes.getState().updateNode("a", { color: "6" });
    expect(useNodes.getState().nodes[0]?.color).toBe("6");
    useNodes.getState().updateNode("a", { color: "#abcdef" });
    expect(useNodes.getState().nodes[0]?.color).toBe("#abcdef");
  });

  test("only mutates the targeted node", () => {
    useNodes.getState().addNode(makeTextNode({ id: "a", text: "A" }));
    useNodes.getState().addNode(makeTextNode({ id: "b", text: "B" }));
    useNodes.getState().updateNode("a", { text: "A!" });
    const [a, b] = useNodes.getState().nodes as TextNode[];
    expect(a?.text).toBe("A!");
    expect(b?.text).toBe("B");
  });
});

describe("deleteNode", () => {
  test("removes the node with the matching id", () => {
    useNodes.getState().addNode(makeTextNode({ id: "a" }));
    useNodes.getState().addNode(makeTextNode({ id: "b" }));
    useNodes.getState().deleteNode("a");
    expect(useNodes.getState().nodes.map((n) => n.id)).toEqual(["b"]);
  });

  test("is a no-op when the id is unknown", () => {
    useNodes.getState().addNode(makeTextNode({ id: "a" }));
    useNodes.getState().deleteNode("nope");
    expect(useNodes.getState().nodes).toHaveLength(1);
  });
});

describe("moveNode", () => {
  test("updates only x and y, leaving width/height untouched", () => {
    useNodes
      .getState()
      .addNode(makeTextNode({ id: "a", x: 0, y: 0, width: 200, height: 80 }));
    useNodes.getState().moveNode("a", 50, 60);
    const n = useNodes.getState().nodes[0]!;
    expect(n.x).toBe(50);
    expect(n.y).toBe(60);
    expect(n.width).toBe(200);
    expect(n.height).toBe(80);
  });

  test("accepts negative coordinates (canvas extends in all directions)", () => {
    useNodes.getState().addNode(makeTextNode({ id: "a" }));
    useNodes.getState().moveNode("a", -100, -200);
    expect(useNodes.getState().nodes[0]?.x).toBe(-100);
    expect(useNodes.getState().nodes[0]?.y).toBe(-200);
  });
});

describe("resizeNode", () => {
  test("updates width and height, leaving x/y untouched by default", () => {
    useNodes
      .getState()
      .addNode(makeTextNode({ id: "a", x: 10, y: 20, width: 200, height: 80 }));
    useNodes.getState().resizeNode("a", 300, 120);
    const n = useNodes.getState().nodes[0]!;
    expect(n.width).toBe(300);
    expect(n.height).toBe(120);
    expect(n.x).toBe(10);
    expect(n.y).toBe(20);
  });

  test("also updates x and y when provided (top-left handle resize)", () => {
    useNodes
      .getState()
      .addNode(makeTextNode({ id: "a", x: 10, y: 20, width: 200, height: 80 }));
    useNodes.getState().resizeNode("a", 250, 100, 5, 15);
    const n = useNodes.getState().nodes[0]!;
    expect(n.width).toBe(250);
    expect(n.height).toBe(100);
    expect(n.x).toBe(5);
    expect(n.y).toBe(15);
  });

  test("only updates one of x/y if only one is provided", () => {
    useNodes
      .getState()
      .addNode(makeTextNode({ id: "a", x: 10, y: 20, width: 200, height: 80 }));
    // Pass x but not y.
    useNodes.getState().resizeNode("a", 300, 80, 7);
    const n = useNodes.getState().nodes[0]!;
    expect(n.x).toBe(7);
    expect(n.y).toBe(20);
  });
});

describe("makeNodeId", () => {
  test("returns a non-empty string", () => {
    const id = makeNodeId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  test("returns a unique id over many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(makeNodeId());
    }
    expect(ids.size).toBe(1000);
  });

  test("returns either a uuid-shaped string or the n_<suffix> fallback", () => {
    // Both shapes are acceptable depending on the runtime; we just want
    // to confirm we never produce empty / whitespace ids.
    const id = makeNodeId();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      );
    const isFallback = /^n_[a-z0-9]{1,12}$/.test(id);
    expect(isUuid || isFallback).toBe(true);
  });
});

describe("type narrowing on AimapNode union", () => {
  test("TextNode is a member of the AimapNode union", () => {
    // This is mostly a TypeScript compile-time guarantee, but we exercise
    // the runtime narrowing path so future variants don't accidentally
    // break the discriminator pattern.
    const t: AimapNode = makeTextNode({ id: "a" });
    expect(t.type).toBe("text");
    if (t.type === "text") {
      // narrowed — `text` is accessible.
      expect(typeof t.text).toBe("string");
    }
  });
});
