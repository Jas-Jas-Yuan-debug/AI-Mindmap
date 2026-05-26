// Unit tests for the pure layer (z-order) reorder helpers used by the
// properties panel's 图层 (Layer) section. Array order == z-order (plan §5):
// index 0 is back, last index is front.

import { describe, expect, test } from "vitest";
import {
  bringForward,
  bringToFront,
  reorderLayer,
  sendBackward,
  sendToBack,
} from "./layerOrder.js";

interface Item {
  id: string;
}

const list = (...ids: string[]): Item[] => ids.map((id) => ({ id }));
const ids = (items: { id: string }[]) => items.map((i) => i.id);
const sel = (...s: string[]): Record<string, true> =>
  Object.fromEntries(s.map((id) => [id, true]));

describe("sendToBack", () => {
  test("moves a single selected node to the front of the array (back z-order)", () => {
    expect(ids(sendToBack(list("a", "b", "c"), sel("c")))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  test("preserves relative order of multiple selected nodes", () => {
    expect(ids(sendToBack(list("a", "b", "c", "d"), sel("b", "d")))).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  test("is a no-op for empty selection", () => {
    expect(ids(sendToBack(list("a", "b"), sel()))).toEqual(["a", "b"]);
  });
});

describe("bringToFront", () => {
  test("moves a single selected node to the end of the array (front z-order)", () => {
    expect(ids(bringToFront(list("a", "b", "c"), sel("a")))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  test("preserves relative order of multiple selected nodes", () => {
    expect(ids(bringToFront(list("a", "b", "c", "d"), sel("a", "c")))).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });
});

describe("sendBackward", () => {
  test("moves a selected node one slot toward the back", () => {
    expect(ids(sendBackward(list("a", "b", "c"), sel("c")))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("a node already at the back stays put", () => {
    expect(ids(sendBackward(list("a", "b", "c"), sel("a")))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("an adjacent selected run moves as a block", () => {
    // b,c are a run; both slide one slot before a's neighbour d? No — here
    // the run [b,c] is preceded by a (unselected); the run moves before a.
    expect(ids(sendBackward(list("a", "b", "c", "d"), sel("b", "c")))).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  test("is a no-op for empty selection", () => {
    expect(ids(sendBackward(list("a", "b"), sel()))).toEqual(["a", "b"]);
  });
});

describe("bringForward", () => {
  test("moves a selected node one slot toward the front", () => {
    expect(ids(bringForward(list("a", "b", "c"), sel("a")))).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  test("a node already at the front stays put", () => {
    expect(ids(bringForward(list("a", "b", "c"), sel("c")))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("an adjacent selected run moves as a block", () => {
    expect(ids(bringForward(list("a", "b", "c", "d"), sel("b", "c")))).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });
});

describe("reorderLayer dispatch", () => {
  const items = list("a", "b", "c");
  test("back", () => {
    expect(ids(reorderLayer("back", items, sel("c")))).toEqual(
      ids(sendToBack(items, sel("c"))),
    );
  });
  test("backward", () => {
    expect(ids(reorderLayer("backward", items, sel("c")))).toEqual(
      ids(sendBackward(items, sel("c"))),
    );
  });
  test("forward", () => {
    expect(ids(reorderLayer("forward", items, sel("a")))).toEqual(
      ids(bringForward(items, sel("a"))),
    );
  });
  test("front", () => {
    expect(ids(reorderLayer("front", items, sel("a")))).toEqual(
      ids(bringToFront(items, sel("a"))),
    );
  });
});

describe("Set-based selection", () => {
  test("accepts a ReadonlySet selection", () => {
    expect(ids(sendToBack(list("a", "b", "c"), new Set(["c"])))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});
