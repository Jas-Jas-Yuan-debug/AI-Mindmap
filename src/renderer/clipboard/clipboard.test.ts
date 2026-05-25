// Unit tests for the in-app clipboard.
//
// The pure `remapSubgraph` helper is the heart of the feature (new ids,
// offset, internal-edge preservation, dangling-edge drop) and gets the
// bulk of the coverage with deterministic injected id minters. We also
// drive `copySelection` / `pasteClipboard` against the real Zustand stores
// to lock in the store-facing behaviour (selection-driven copy, paste
// selects the new nodes, internal-only edge filtering at copy time).
//
// No React / Konva here — the clipboard module is store-only.

import { beforeEach, describe, expect, test } from "vitest";
import {
  type ClipboardPayload,
  PASTE_OFFSET,
  clearClipboard,
  copySelection,
  getClipboard,
  pasteClipboard,
  remapSubgraph,
} from "./clipboard.js";
import { type AimapNode, type TextNode, useNodes } from "../store/nodes.js";
import { type Edge, useEdges } from "../store/edges.js";
import { useSelection } from "../store/selection.js";

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
  fromNode: overrides.fromNode ?? "n1",
  toNode: overrides.toNode ?? "n2",
  ...overrides,
});

// Deterministic id minters so assertions are stable.
function counter(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}${++i}`;
}

beforeEach(() => {
  useNodes.setState({ nodes: [] });
  useEdges.setState({ edges: [] });
  useSelection.getState().clear();
  clearClipboard();
});

describe("remapSubgraph (pure)", () => {
  test("2 nodes + 1 internal edge → 2 new node ids, 1 new edge id, endpoints remapped", () => {
    const payload: ClipboardPayload = {
      nodes: [
        makeTextNode({ id: "a", x: 0, y: 0 }),
        makeTextNode({ id: "b", x: 100, y: 50 }),
      ],
      edges: [makeEdge({ id: "e", fromNode: "a", toNode: "b" })],
    };

    const out = remapSubgraph(
      payload,
      counter("node-"),
      counter("edge-"),
      { dx: 20, dy: 20 },
    );

    expect(out.nodes).toHaveLength(2);
    expect(out.edges).toHaveLength(1);
    expect(out.nodes.map((n) => n.id)).toEqual(["node-1", "node-2"]);
    expect(out.edges[0]!.id).toBe("edge-1");
    // Endpoints remapped to the NEW node ids, in array order.
    expect(out.edges[0]!.fromNode).toBe("node-1");
    expect(out.edges[0]!.toNode).toBe("node-2");
  });

  test("edge to a node OUTSIDE the payload is dropped", () => {
    // Payload only carries node "a"; the edge references "a" → "outside".
    const payload: ClipboardPayload = {
      nodes: [makeTextNode({ id: "a" })],
      edges: [makeEdge({ id: "e", fromNode: "a", toNode: "outside" })],
    };

    const out = remapSubgraph(
      payload,
      counter("node-"),
      counter("edge-"),
      { dx: 0, dy: 0 },
    );

    expect(out.nodes).toHaveLength(1);
    expect(out.edges).toHaveLength(0);
  });

  test("offset is applied to x/y of every node", () => {
    const payload: ClipboardPayload = {
      nodes: [
        makeTextNode({ id: "a", x: 10, y: 20 }),
        makeTextNode({ id: "b", x: -5, y: 0 }),
      ],
      edges: [],
    };

    const out = remapSubgraph(
      payload,
      counter("node-"),
      counter("edge-"),
      { dx: 20, dy: 30 },
    );

    expect(out.nodes[0]).toMatchObject({ x: 30, y: 50 });
    expect(out.nodes[1]).toMatchObject({ x: 15, y: 30 });
  });

  test("new ids differ from originals for every node and edge", () => {
    const payload: ClipboardPayload = {
      nodes: [
        makeTextNode({ id: "a" }),
        makeTextNode({ id: "b" }),
      ],
      edges: [makeEdge({ id: "e", fromNode: "a", toNode: "b" })],
    };

    const out = remapSubgraph(
      payload,
      counter("node-"),
      counter("edge-"),
      { dx: 1, dy: 1 },
    );

    const oldNodeIds = new Set(["a", "b"]);
    for (const n of out.nodes) expect(oldNodeIds.has(n.id)).toBe(false);
    expect(out.edges[0]!.id).not.toBe("e");
  });

  test("internal referential integrity preserved across a chain a→b→c", () => {
    const payload: ClipboardPayload = {
      nodes: [
        makeTextNode({ id: "a" }),
        makeTextNode({ id: "b" }),
        makeTextNode({ id: "c" }),
      ],
      edges: [
        makeEdge({ id: "e1", fromNode: "a", toNode: "b" }),
        makeEdge({ id: "e2", fromNode: "b", toNode: "c" }),
      ],
    };

    const out = remapSubgraph(
      payload,
      counter("node-"),
      counter("edge-"),
      { dx: 0, dy: 0 },
    );

    // Build the set of new node ids; every edge endpoint must be in it.
    const newIds = new Set(out.nodes.map((n) => n.id));
    for (const e of out.edges) {
      expect(newIds.has(e.fromNode)).toBe(true);
      expect(newIds.has(e.toNode)).toBe(true);
    }
    // The shared node "b" must map to the SAME new id in both edges.
    expect(out.edges[0]!.toNode).toBe(out.edges[1]!.fromNode);
  });

  test("preserves non-id edge fields (label, color, sides)", () => {
    const payload: ClipboardPayload = {
      nodes: [makeTextNode({ id: "a" }), makeTextNode({ id: "b" })],
      edges: [
        makeEdge({
          id: "e",
          fromNode: "a",
          toNode: "b",
          label: "rel",
          color: "5",
          fromSide: "right",
          toSide: "left",
        }),
      ],
    };

    const out = remapSubgraph(
      payload,
      counter("node-"),
      counter("edge-"),
      { dx: 0, dy: 0 },
    );

    expect(out.edges[0]).toMatchObject({
      label: "rel",
      color: "5",
      fromSide: "right",
      toSide: "left",
    });
  });

  test("preserves node fields (text, color, size) other than id/x/y", () => {
    const payload: ClipboardPayload = {
      nodes: [
        makeTextNode({
          id: "a",
          text: "# hello",
          color: "3",
          width: 300,
          height: 120,
        }),
      ],
      edges: [],
    };

    const out = remapSubgraph(
      payload,
      counter("node-"),
      counter("edge-"),
      { dx: 0, dy: 0 },
    );

    expect(out.nodes[0]).toMatchObject({
      text: "# hello",
      color: "3",
      width: 300,
      height: 120,
    });
  });

  test("empty payload yields empty result", () => {
    const out = remapSubgraph(
      { nodes: [], edges: [] },
      counter("node-"),
      counter("edge-"),
      { dx: 5, dy: 5 },
    );
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });
});

describe("copySelection (store-driven)", () => {
  test("collects selected nodes + only internal edges", () => {
    const a = makeTextNode({ id: "a" });
    const b = makeTextNode({ id: "b" });
    const c = makeTextNode({ id: "c" });
    useNodes.setState({ nodes: [a, b, c] });
    useEdges.setState({
      edges: [
        makeEdge({ id: "ab", fromNode: "a", toNode: "b" }), // internal
        makeEdge({ id: "bc", fromNode: "b", toNode: "c" }), // dangling (c not selected)
      ],
    });
    useSelection.getState().set(["a", "b"]);

    const payload = copySelection();
    expect(payload).not.toBeNull();
    expect(payload!.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    // Only the a→b edge is internal to the selection.
    expect(payload!.edges.map((e) => e.id)).toEqual(["ab"]);
  });

  test("returns null and leaves clipboard untouched when nothing selected", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a" })] });
    useSelection.getState().set(["a"]);
    copySelection(); // seed the clipboard
    const seeded = getClipboard();
    expect(seeded).not.toBeNull();

    useSelection.getState().clear();
    const result = copySelection();
    expect(result).toBeNull();
    // Prior payload preserved.
    expect(getClipboard()).toBe(seeded);
  });

  test("clipboard is decoupled from later store mutation (deep clone)", () => {
    const a = makeTextNode({ id: "a", text: "orig" });
    useNodes.setState({ nodes: [a] });
    useSelection.getState().set(["a"]);
    copySelection();

    // Mutate the live node after copying.
    useNodes.getState().updateNode("a", { text: "changed" });

    expect(getClipboard()!.nodes[0]!.text).toBe("orig");
  });
});

describe("pasteClipboard (store-driven)", () => {
  test("adds offset nodes + remapped edges, selects new nodes", () => {
    const a = makeTextNode({ id: "a", x: 0, y: 0 });
    const b = makeTextNode({ id: "b", x: 100, y: 0 });
    useNodes.setState({ nodes: [a, b] });
    useEdges.setState({
      edges: [makeEdge({ id: "ab", fromNode: "a", toNode: "b" })],
    });
    useSelection.getState().set(["a", "b"]);
    copySelection();

    const before = useNodes.getState().nodes.length;
    const { nodeIds, edgeIds } = pasteClipboard(PASTE_OFFSET);

    expect(nodeIds).toHaveLength(2);
    expect(edgeIds).toHaveLength(1);
    // Two new nodes + one new edge added to the live stores.
    expect(useNodes.getState().nodes.length).toBe(before + 2);
    expect(useEdges.getState().edges.length).toBe(2);

    // New nodes carry the offset.
    const pasted = useNodes.getState().nodes.filter((n: AimapNode) =>
      nodeIds.includes(n.id),
    );
    expect(pasted.find((n) => n.x === PASTE_OFFSET.dx)).toBeTruthy();

    // Selection now points at the pasted nodes only.
    expect(Object.keys(useSelection.getState().ids).sort()).toEqual(
      [...nodeIds].sort(),
    );

    // Pasted edge endpoints reference the pasted nodes, not the originals.
    const pastedEdge = useEdges
      .getState()
      .edges.find((e: Edge) => edgeIds.includes(e.id))!;
    expect(nodeIds).toContain(pastedEdge.fromNode);
    expect(nodeIds).toContain(pastedEdge.toNode);
  });

  test("paste with empty clipboard is a no-op", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a" })] });
    const { nodeIds, edgeIds } = pasteClipboard(PASTE_OFFSET);
    expect(nodeIds).toEqual([]);
    expect(edgeIds).toEqual([]);
    expect(useNodes.getState().nodes.length).toBe(1);
  });

  test("copy → paste → paste cascades two independent copies", () => {
    useNodes.setState({ nodes: [makeTextNode({ id: "a", x: 0, y: 0 })] });
    useSelection.getState().set(["a"]);
    copySelection();

    const first = pasteClipboard(PASTE_OFFSET);
    const second = pasteClipboard(PASTE_OFFSET);

    // Three nodes total (original + 2 pastes), all distinct ids.
    expect(useNodes.getState().nodes.length).toBe(3);
    const allIds = new Set([
      "a",
      ...first.nodeIds,
      ...second.nodeIds,
    ]);
    expect(allIds.size).toBe(3);
  });
});
