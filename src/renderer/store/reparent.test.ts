// Unit tests for the Phase 6 reparenting primitives + cycle prevention.
//
// The pure helpers (isDescendant / wouldCreateCycle / childrenOf /
// descendantsOf) are exercised over plain node arrays. `setParent` is the one
// store action, so those cases drive `useNodes` directly (as in nodes.test.ts)
// and assert it refuses cycles while leaving the store untouched.

import { beforeEach, describe, expect, test } from "vitest";
import {
  type AimapNode,
  type GroupNode,
  type TextNode,
  useNodes,
} from "./nodes.js";
import {
  childrenOf,
  depthOf,
  descendantsOf,
  groupSelection,
  isDescendant,
  isHiddenByCollapsedAncestor,
  setParent,
  topGroupOf,
  ungroupSelection,
  wouldCreateCycle,
} from "./reparent.js";
import { useHistory } from "./history.js";

// --- Fixtures --------------------------------------------------------------

const group = (id: string, parentId?: string): GroupNode => ({
  id,
  type: "group",
  x: 0,
  y: 0,
  width: 320,
  height: 200,
  ...(parentId !== undefined ? { parentId } : {}),
});

const collapsedGroup = (id: string, parentId?: string): GroupNode => ({
  ...group(id, parentId),
  collapsed: true,
});

const text = (id: string, parentId?: string): TextNode => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 200,
  height: 80,
  text: "",
  ...(parentId !== undefined ? { parentId } : {}),
});

// Tree used by most cases:
//   A (group, top-level)
//   ├── B (group, parent A)
//   │   └── C (text,  parent B)
//   └── D (text,  parent A)
//   E (text, top-level, no parent)  ← sibling, NOT in A's subtree
const tree = (): AimapNode[] => [
  group("A"),
  group("B", "A"),
  text("C", "B"),
  text("D", "A"),
  text("E"),
];

// --- isDescendant ----------------------------------------------------------

describe("isDescendant", () => {
  test("direct child is a descendant of its parent", () => {
    expect(isDescendant(tree(), "A", "D")).toBe(true);
    expect(isDescendant(tree(), "B", "C")).toBe(true);
  });

  test("transitive descendant (grandchild) is detected", () => {
    expect(isDescendant(tree(), "A", "C")).toBe(true); // C is under B under A
  });

  test("a node is NOT its own ancestor", () => {
    expect(isDescendant(tree(), "A", "A")).toBe(false);
  });

  test("a sibling is not a descendant", () => {
    expect(isDescendant(tree(), "B", "D")).toBe(false); // D is under A, not B
  });

  test("a top-level node is not a descendant of anything", () => {
    expect(isDescendant(tree(), "A", "E")).toBe(false);
  });

  test("unknown ids return false rather than throwing", () => {
    expect(isDescendant(tree(), "ghost", "C")).toBe(false);
    expect(isDescendant(tree(), "A", "ghost")).toBe(false);
  });

  test("a pre-existing parentId loop does not hang the walk", () => {
    // X ↔ Y mutual parents (corrupt). The seen-set bounds the walk.
    const corrupt: AimapNode[] = [group("X", "Y"), group("Y", "X")];
    expect(isDescendant(corrupt, "Z", "X")).toBe(false);
  });
});

// --- wouldCreateCycle ------------------------------------------------------

describe("wouldCreateCycle", () => {
  test("self-parenting is a cycle", () => {
    expect(wouldCreateCycle(tree(), "A", "A")).toBe(true);
  });

  test("parenting under a direct descendant is a cycle", () => {
    // Making A a child of B (B is A's child) loops.
    expect(wouldCreateCycle(tree(), "A", "B")).toBe(true);
  });

  test("parenting under a transitive descendant is a cycle", () => {
    // Making A a child of C (C is A's grandchild) loops.
    expect(wouldCreateCycle(tree(), "A", "C")).toBe(true);
  });

  test("parenting under an unrelated node is NOT a cycle", () => {
    // Putting top-level E inside A is fine.
    expect(wouldCreateCycle(tree(), "E", "A")).toBe(false);
  });

  test("parenting a sibling under a sibling is NOT a cycle", () => {
    // D and B are both children of A; moving D into B is legal.
    expect(wouldCreateCycle(tree(), "D", "B")).toBe(false);
  });
});

// --- childrenOf ------------------------------------------------------------

describe("childrenOf", () => {
  test("returns only direct children, in array order", () => {
    const kids = childrenOf(tree(), "A").map((n) => n.id);
    expect(kids).toEqual(["B", "D"]); // NOT C (grandchild)
  });

  test("returns an empty array for a leaf / unknown group", () => {
    expect(childrenOf(tree(), "C")).toEqual([]);
    expect(childrenOf(tree(), "ghost")).toEqual([]);
  });
});

// --- descendantsOf ---------------------------------------------------------

describe("descendantsOf", () => {
  test("returns the full subtree (children + grandchildren)", () => {
    const ids = descendantsOf(tree(), "A").map((n) => n.id).sort();
    expect(ids).toEqual(["B", "C", "D"]);
  });

  test("nested group subtree resolves correctly", () => {
    expect(descendantsOf(tree(), "B").map((n) => n.id)).toEqual(["C"]);
  });

  test("excludes the group itself and unrelated nodes", () => {
    const ids = descendantsOf(tree(), "A").map((n) => n.id);
    expect(ids).not.toContain("A");
    expect(ids).not.toContain("E");
  });

  test("a malformed loop does not hang the walk", () => {
    const corrupt: AimapNode[] = [group("X", "Y"), group("Y", "X")];
    // Bounded by the seen-set; should terminate and not include X twice.
    const ids = descendantsOf(corrupt, "X").map((n) => n.id);
    expect(ids).not.toContain("X");
  });
});

// --- depthOf ---------------------------------------------------------------

describe("depthOf", () => {
  test("a top-level node has depth 0", () => {
    expect(depthOf(tree(), "A")).toBe(0);
    expect(depthOf(tree(), "E")).toBe(0);
  });

  test("a direct child has depth 1", () => {
    expect(depthOf(tree(), "B")).toBe(1); // B under A
    expect(depthOf(tree(), "D")).toBe(1); // D under A
  });

  test("a grandchild has depth 2", () => {
    expect(depthOf(tree(), "C")).toBe(2); // C under B under A
  });

  test("a malformed loop does not hang the walk", () => {
    const corrupt: AimapNode[] = [group("X", "Y"), group("Y", "X")];
    // Bounded by the seen-set; terminates with a finite depth.
    expect(Number.isFinite(depthOf(corrupt, "X"))).toBe(true);
  });
});

// --- setParent (store action + cycle refusal) ------------------------------

describe("setParent", () => {
  beforeEach(() => {
    useNodes.setState({ nodes: tree() });
  });

  const parentOf = (id: string) =>
    useNodes.getState().nodes.find((n) => n.id === id)?.parentId;

  test("sets a node's parent when legal", () => {
    expect(setParent("E", "A")).toBe(true);
    expect(parentOf("E")).toBe("A");
  });

  test("clears a node's parent with null", () => {
    expect(setParent("D", null)).toBe(true);
    expect(parentOf("D")).toBeUndefined();
  });

  test("REFUSES a self-parent and leaves the store untouched", () => {
    expect(setParent("A", "A")).toBe(false);
    expect(parentOf("A")).toBeUndefined();
  });

  test("REFUSES parenting under a direct descendant", () => {
    // A under B would loop (B is A's child).
    expect(setParent("A", "B")).toBe(false);
    expect(parentOf("A")).toBeUndefined();
  });

  test("REFUSES parenting under a transitive descendant", () => {
    // A under C would loop (C is A's grandchild).
    expect(setParent("A", "C")).toBe(false);
    expect(parentOf("A")).toBeUndefined();
  });

  test("refuses an unknown parent id", () => {
    expect(setParent("E", "ghost")).toBe(false);
    expect(parentOf("E")).toBeUndefined();
  });

  test("unknown child id is a no-op returning false", () => {
    expect(setParent("ghost", "A")).toBe(false);
  });

  test("re-parenting to the existing parent is an idempotent success", () => {
    expect(setParent("D", "A")).toBe(true); // D already child of A
    expect(parentOf("D")).toBe("A");
  });

  test("clearing an already-top-level node is an idempotent success", () => {
    expect(setParent("E", null)).toBe(true);
    expect(parentOf("E")).toBeUndefined();
  });

  test("moving a sibling under a sibling group is allowed", () => {
    expect(setParent("D", "B")).toBe(true);
    expect(parentOf("D")).toBe("B");
  });
});

// --- isHiddenByCollapsedAncestor -------------------------------------------

describe("isHiddenByCollapsedAncestor", () => {
  // Tree:
  //   A (group, collapsed)
  //   ├── B (group, parent A)        ← hidden (ancestor A collapsed)
  //   │   └── C (text,  parent B)    ← hidden (ancestor A collapsed)
  //   └── D (text,  parent A)        ← hidden (parent A collapsed)
  //   E (text, top-level)            ← visible
  const collapsedTree = (): AimapNode[] => [
    collapsedGroup("A"),
    group("B", "A"),
    text("C", "B"),
    text("D", "A"),
    text("E"),
  ];

  test("a top-level node is never hidden", () => {
    expect(isHiddenByCollapsedAncestor(collapsedTree(), "E")).toBe(false);
  });

  test("the collapsed group ITSELF is not hidden (it still draws its header)", () => {
    expect(isHiddenByCollapsedAncestor(collapsedTree(), "A")).toBe(false);
  });

  test("a direct child of a collapsed group is hidden", () => {
    expect(isHiddenByCollapsedAncestor(collapsedTree(), "D")).toBe(true);
    expect(isHiddenByCollapsedAncestor(collapsedTree(), "B")).toBe(true);
  });

  test("a transitive descendant of a collapsed group is hidden", () => {
    // C is under B under collapsed A.
    expect(isHiddenByCollapsedAncestor(collapsedTree(), "C")).toBe(true);
  });

  test("an EXPANDED group's descendants are visible", () => {
    // Same shape but A is NOT collapsed.
    const nodes: AimapNode[] = [
      group("A"),
      group("B", "A"),
      text("C", "B"),
      text("D", "A"),
    ];
    expect(isHiddenByCollapsedAncestor(nodes, "B")).toBe(false);
    expect(isHiddenByCollapsedAncestor(nodes, "C")).toBe(false);
    expect(isHiddenByCollapsedAncestor(nodes, "D")).toBe(false);
  });

  test("a node's OWN collapsed flag does not hide it", () => {
    // A is collapsed but top-level — it must still render (header + count).
    expect(isHiddenByCollapsedAncestor([collapsedGroup("A")], "A")).toBe(false);
  });

  test("hidden when ANY ancestor up the chain is collapsed (nested collapse)", () => {
    // Outer expanded, inner collapsed: a grandchild of the inner is hidden.
    const nodes: AimapNode[] = [
      group("outer"),
      collapsedGroup("inner", "outer"),
      text("leaf", "inner"),
    ];
    expect(isHiddenByCollapsedAncestor(nodes, "inner")).toBe(false); // inner itself shows
    expect(isHiddenByCollapsedAncestor(nodes, "leaf")).toBe(true);
  });

  test("does not hang on a malformed parentId loop", () => {
    // X ↔ Y point at each other; neither is a group, so neither is hidden,
    // and the seen-guard must terminate the walk.
    const nodes: AimapNode[] = [text("X", "Y"), text("Y", "X")];
    expect(isHiddenByCollapsedAncestor(nodes, "X")).toBe(false);
  });

  test("a dangling parentId (missing ancestor) is treated as visible", () => {
    const nodes: AimapNode[] = [text("orphan", "ghost")];
    expect(isHiddenByCollapsedAncestor(nodes, "orphan")).toBe(false);
  });
});

// --- topGroupOf ------------------------------------------------------------

describe("topGroupOf", () => {
  // Tree:
  //   outer (group, top-level)
  //   └── inner (group, parent outer)
  //       └── leaf (text, parent inner)
  //   solo (text, top-level)
  const nestedTree = (): AimapNode[] => [
    group("outer"),
    group("inner", "outer"),
    text("leaf", "inner"),
    text("solo"),
  ];

  test("returns null for a top-level node (no group ancestor)", () => {
    expect(topGroupOf(nestedTree(), "outer")).toBeNull();
    expect(topGroupOf(nestedTree(), "solo")).toBeNull();
  });

  test("returns the outermost group for a deeply nested node", () => {
    // leaf is under inner under outer; outermost is outer
    expect(topGroupOf(nestedTree(), "leaf")).toBe("outer");
  });

  test("returns the direct group parent when only one level of nesting", () => {
    // inner's parent is outer (a group) so outer is the outermost
    expect(topGroupOf(nestedTree(), "inner")).toBe("outer");
  });

  test("returns null for an unknown id", () => {
    expect(topGroupOf(nestedTree(), "ghost")).toBeNull();
  });

  test("does not hang on a malformed parentId loop", () => {
    const corrupt: AimapNode[] = [group("X", "Y"), group("Y", "X")];
    // Should terminate; result may be X or Y depending on walk order, but MUST NOT throw or loop
    const result = topGroupOf(corrupt, "X");
    expect(typeof result === "string" || result === null).toBe(true);
  });
});

// --- groupSelection --------------------------------------------------------

describe("groupSelection", () => {
  // Helper: two text nodes placed at known positions
  const twoNodes = (): AimapNode[] => [
    { id: "t1", type: "text", x: 100, y: 100, width: 200, height: 80, text: "" },
    { id: "t2", type: "text", x: 400, y: 300, width: 200, height: 80, text: "" },
  ];

  beforeEach(() => {
    useNodes.setState({ nodes: twoNodes() });
    useHistory.getState().clear();
  });

  test("returns null when fewer than 2 valid ids are given", () => {
    expect(groupSelection([])).toBeNull();
    expect(groupSelection(["t1"])).toBeNull();
  });

  test("returns null when given only unknown ids", () => {
    expect(groupSelection(["ghost1", "ghost2"])).toBeNull();
  });

  test("creates a new GroupNode in the store and returns its id", () => {
    const gid = groupSelection(["t1", "t2"]);
    expect(gid).not.toBeNull();
    const nodes = useNodes.getState().nodes;
    const g = nodes.find((n) => n.id === gid);
    expect(g).toBeDefined();
    expect(g?.type).toBe("group");
  });

  test("the new group's bbox encloses both members with padding", () => {
    const gid = groupSelection(["t1", "t2"])!;
    const g = useNodes.getState().nodes.find((n) => n.id === gid)!;
    // minX=100, minY=100; maxX=600, maxY=380
    // x = round(100 - 24) = 76
    // y = round(100 - 24 - 28) = 48
    // w = round((600-100) + 48) = 548
    // h = round((380-100) + 48 + 28) = 356
    expect(g.x).toBe(76);
    expect(g.y).toBe(48);
    expect(g.width).toBe(548);
    expect(g.height).toBe(356);
  });

  test("reparents both members under the new group", () => {
    const gid = groupSelection(["t1", "t2"])!;
    const nodes = useNodes.getState().nodes;
    const t1 = nodes.find((n) => n.id === "t1")!;
    const t2 = nodes.find((n) => n.id === "t2")!;
    expect(t1.parentId).toBe(gid);
    expect(t2.parentId).toBe(gid);
  });

  test("ignores unknown ids and groups the 2 valid ones", () => {
    const gid = groupSelection(["t1", "ghost", "t2"]);
    expect(gid).not.toBeNull();
    const nodes = useNodes.getState().nodes;
    expect(nodes.find((n) => n.id === "t1")?.parentId).toBe(gid!);
    expect(nodes.find((n) => n.id === "t2")?.parentId).toBe(gid!);
  });
});

// --- ungroupSelection ------------------------------------------------------

describe("ungroupSelection", () => {
  // Tree:
  //   outer (group, top-level)
  //   └── inner (group, parent outer)
  //       ├── leaf1 (text, parent inner)
  //       └── leaf2 (text, parent inner)
  //   solo (text, top-level)
  const nestedTree = (): AimapNode[] => [
    group("outer"),
    group("inner", "outer"),
    text("leaf1", "inner"),
    text("leaf2", "inner"),
    text("solo"),
  ];

  beforeEach(() => {
    useNodes.setState({ nodes: nestedTree() });
    useHistory.getState().clear();
  });

  const parentOf = (id: string) =>
    useNodes.getState().nodes.find((n) => n.id === id)?.parentId;
  const exists = (id: string) =>
    useNodes.getState().nodes.some((n) => n.id === id);

  test("returns empty array and is a no-op for a non-group id", () => {
    const freed = ungroupSelection(["solo"]);
    expect(freed).toEqual([]);
    expect(exists("solo")).toBe(true);
  });

  test("deletes the group node", () => {
    ungroupSelection(["inner"]);
    expect(exists("inner")).toBe(false);
  });

  test("lifts direct children to the group's parent", () => {
    // inner's parent is outer, so children should become outer's children
    ungroupSelection(["inner"]);
    expect(parentOf("leaf1")).toBe("outer");
    expect(parentOf("leaf2")).toBe("outer");
  });

  test("lifts children to top-level when the group has no parent", () => {
    ungroupSelection(["outer"]);
    expect(exists("outer")).toBe(false);
    // inner (direct child of outer) should now be top-level
    expect(parentOf("inner")).toBeUndefined();
  });

  test("returns the freed child ids", () => {
    const freed = ungroupSelection(["inner"]);
    expect(freed.sort()).toEqual(["leaf1", "leaf2"].sort());
  });

  test("handles multiple groups in one call", () => {
    // Re-seed with two sibling groups both at top-level
    useNodes.setState({
      nodes: [
        group("g1"),
        group("g2"),
        text("a", "g1"),
        text("b", "g1"),
        text("c", "g2"),
      ],
    });
    const freed = ungroupSelection(["g1", "g2"]);
    expect(freed.sort()).toEqual(["a", "b", "c"].sort());
    expect(exists("g1")).toBe(false);
    expect(exists("g2")).toBe(false);
    expect(parentOf("a")).toBeUndefined();
    expect(parentOf("b")).toBeUndefined();
    expect(parentOf("c")).toBeUndefined();
  });

  test("is a no-op for unknown ids", () => {
    const nodeCountBefore = useNodes.getState().nodes.length;
    const freed = ungroupSelection(["ghost1", "ghost2"]);
    expect(freed).toEqual([]);
    expect(useNodes.getState().nodes.length).toBe(nodeCountBefore);
  });
});

// --- Undo / redo of re-parenting -------------------------------------------
//
// Plan §6 Phase 6 exit criterion: "Undo/redo works for re-parenting." A
// reparent must be undoable in ONE step and redoable. The caller wraps the
// reparent in `transact` (or a manual `capture()` before `setParent`) so the
// pre-reparent document is snapshotted; undo restores it, redo re-applies.

describe("undo / redo of re-parenting", () => {
  beforeEach(() => {
    useNodes.setState({ nodes: tree() });
    useHistory.getState().clear();
  });

  const parentOf = (id: string) =>
    useNodes.getState().nodes.find((n) => n.id === id)?.parentId;

  test("transact(setParent) is undoable in ONE step and redoable", () => {
    // E starts top-level. Reparent it under A inside a transaction.
    useHistory.getState().transact(() => {
      expect(setParent("E", "A")).toBe(true);
    });
    expect(parentOf("E")).toBe("A");

    // One undo restores E to the top level.
    useHistory.getState().undo();
    expect(parentOf("E")).toBeUndefined();

    // Redo re-applies the reparent.
    useHistory.getState().redo();
    expect(parentOf("E")).toBe("A");
  });

  test("undo of a DETACH (setParent null) restores the prior parent", () => {
    // D starts as a child of A. Detach it to the top level.
    useHistory.getState().transact(() => {
      expect(setParent("D", null)).toBe(true);
    });
    expect(parentOf("D")).toBeUndefined();

    useHistory.getState().undo();
    expect(parentOf("D")).toBe("A");

    useHistory.getState().redo();
    expect(parentOf("D")).toBeUndefined();
  });

  test("a reparent + the move it rides with collapse into one undo step", () => {
    // Mirrors the drag-onto-group gesture: capture once, then move + reparent.
    useHistory.getState().transact(() => {
      useNodes.getState().moveNode("E", 500, 500);
      expect(setParent("E", "A")).toBe(true);
    });
    expect(parentOf("E")).toBe("A");
    expect(useNodes.getState().nodes.find((n) => n.id === "E")?.x).toBe(500);

    // A SINGLE undo reverts BOTH the move and the reparent.
    useHistory.getState().undo();
    expect(parentOf("E")).toBeUndefined();
    expect(useNodes.getState().nodes.find((n) => n.id === "E")?.x).toBe(0);
  });
});
