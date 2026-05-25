// Save/load round-trip tests for GROUP HIERARCHY (Phase 6 PR 3/3 — sibling C).
//
// Plan §6 Phase 6 exit criterion: "Save/load preserves group hierarchy." A
// document with groups, parented children, and a NESTED group must survive
// `toAimapFile` → `fromAimapFile` (the in-memory serialize round-trip) AND a
// trip through the Zod schema (`parseAimapFile`, which is what the disk save
// path validates against) with every hierarchy field intact:
//   - each node's `parentId`
//   - each GroupNode's `label`
//   - each GroupNode's `collapsed`
//
// The base round-trip (nodes/edges/viewport, z-order, 50-node canvas) is
// covered in aimap.test.ts; this file zeroes in on the group hierarchy fields
// that Phase 6 added behavior around.

import { describe, expect, it } from "vitest";
import { parseAimapFile, type AimapViewport, type Node } from "./aimap.js";
import { fromAimapFile, toAimapFile } from "./serialize.js";

const VIEWPORT: AimapViewport = { x: 0, y: 0, zoom: 1 };

// A hierarchy with a nested group:
//   outer (group, label "Outer", collapsed)
//   ├── child1 (text, parent outer)
//   ├── child2 (text, parent outer)
//   └── inner (group, label "Inner", parent outer)
//       └── grandchild (text, parent inner)
const hierarchy = (): Node[] => [
  {
    id: "outer",
    type: "group",
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    label: "Outer",
    collapsed: true,
  },
  {
    id: "child1",
    type: "text",
    x: 20,
    y: 40,
    width: 200,
    height: 80,
    text: "first",
    parentId: "outer",
  },
  {
    id: "child2",
    type: "text",
    x: 20,
    y: 140,
    width: 200,
    height: 80,
    text: "second",
    parentId: "outer",
  },
  {
    id: "inner",
    type: "group",
    x: 260,
    y: 40,
    width: 300,
    height: 300,
    label: "Inner",
    parentId: "outer",
  },
  {
    id: "grandchild",
    type: "text",
    x: 280,
    y: 80,
    width: 200,
    height: 80,
    text: "nested",
    parentId: "inner",
  },
];

describe("save/load preserves group hierarchy", () => {
  it("in-memory round-trip preserves parentId on every node", () => {
    const built = toAimapFile({ nodes: hierarchy(), edges: [], viewport: VIEWPORT });
    const back = fromAimapFile(built);
    const parentById = Object.fromEntries(
      back.nodes.map((n) => [n.id, n.parentId]),
    );
    expect(parentById).toEqual({
      outer: undefined,
      child1: "outer",
      child2: "outer",
      inner: "outer", // nested group keeps its parent
      grandchild: "inner",
    });
  });

  it("in-memory round-trip preserves group label + collapsed", () => {
    const built = toAimapFile({ nodes: hierarchy(), edges: [], viewport: VIEWPORT });
    const back = fromAimapFile(built);
    const outer = back.nodes.find((n) => n.id === "outer");
    const inner = back.nodes.find((n) => n.id === "inner");
    expect(outer).toMatchObject({ type: "group", label: "Outer", collapsed: true });
    expect(inner).toMatchObject({ type: "group", label: "Inner" });
    // Inner never set `collapsed`, so it must stay absent (not coerced to false).
    expect(inner && "collapsed" in inner).toBe(false);
  });

  it("survives a JSON stringify/parse + Zod validation (the disk path)", () => {
    const built = toAimapFile({ nodes: hierarchy(), edges: [], viewport: VIEWPORT });
    // Emulate writing to disk and reading back.
    const onDisk = JSON.parse(JSON.stringify(built));
    const parsed = parseAimapFile(onDisk);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = fromAimapFile(parsed.data);
    // parentId chain intact through Zod.
    expect(back.nodes.find((n) => n.id === "grandchild")?.parentId).toBe("inner");
    expect(back.nodes.find((n) => n.id === "inner")?.parentId).toBe("outer");
    // label + collapsed intact through Zod.
    const outer = back.nodes.find((n) => n.id === "outer");
    expect(outer).toMatchObject({ label: "Outer", collapsed: true });
  });

  it("preserves the node order (z-order) of the hierarchy", () => {
    const built = toAimapFile({ nodes: hierarchy(), edges: [], viewport: VIEWPORT });
    const back = fromAimapFile(built);
    expect(back.nodes.map((n) => n.id)).toEqual([
      "outer",
      "child1",
      "child2",
      "inner",
      "grandchild",
    ]);
  });
});
