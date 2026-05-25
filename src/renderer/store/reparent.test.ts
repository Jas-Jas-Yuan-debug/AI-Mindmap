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
  isDescendant,
  setParent,
  wouldCreateCycle,
} from "./reparent.js";

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
