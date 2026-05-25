// Unit tests for the document-status slice (Phase 5 PR 3/3, sibling C):
// markDirty / markSaved transitions + the store subscriptions that flip the
// dirty flag on nodes/edges/viewport edits.

import { beforeEach, describe, expect, test } from "vitest";
import {
  useDocStatus,
  installDocStatusSubscriptions,
} from "./docStatus.js";
import { useNodes, type TextNode } from "./nodes.js";
import { useEdges, type Edge } from "./edges.js";
import { useViewport } from "./viewport.js";

const node = (id: string): TextNode => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  text: "hi",
});

const edge = (id: string): Edge => ({
  id,
  fromNode: "a",
  toNode: "b",
});

let teardown: () => void = () => {};

beforeEach(() => {
  teardown();
  useNodes.setState({ nodes: [] });
  useEdges.setState({ edges: [] });
  useViewport.getState().reset();
  // Start each test clean.
  useDocStatus.setState({ dirty: false, lastSavedAt: null });
});

describe("markDirty / markSaved", () => {
  test("starts clean", () => {
    expect(useDocStatus.getState().dirty).toBe(false);
    expect(useDocStatus.getState().lastSavedAt).toBeNull();
  });

  test("markDirty sets dirty true", () => {
    useDocStatus.getState().markDirty();
    expect(useDocStatus.getState().dirty).toBe(true);
  });

  test("markSaved clears dirty and stamps lastSavedAt", () => {
    useDocStatus.getState().markDirty();
    useDocStatus.getState().markSaved(123456);
    expect(useDocStatus.getState().dirty).toBe(false);
    expect(useDocStatus.getState().lastSavedAt).toBe(123456);
  });

  test("markDirty is idempotent — no new state object once already dirty", () => {
    useDocStatus.getState().markDirty();
    const first = useDocStatus.getState();
    useDocStatus.getState().markDirty();
    // Same reference => no notification churn for subscribers.
    expect(useDocStatus.getState()).toBe(first);
  });
});

describe("installDocStatusSubscriptions", () => {
  test("a node edit marks the document dirty", () => {
    teardown = installDocStatusSubscriptions();
    expect(useDocStatus.getState().dirty).toBe(false);
    useNodes.getState().addNode(node("n1"));
    expect(useDocStatus.getState().dirty).toBe(true);
  });

  test("an edge edit marks the document dirty", () => {
    teardown = installDocStatusSubscriptions();
    useEdges.getState().addEdge(edge("e1"));
    expect(useDocStatus.getState().dirty).toBe(true);
  });

  test("a viewport change marks the document dirty", () => {
    teardown = installDocStatusSubscriptions();
    useViewport.getState().setViewport({ x: 10, y: 20, zoom: 2 });
    expect(useDocStatus.getState().dirty).toBe(true);
  });

  test("teardown stops further edits from marking dirty", () => {
    const off = installDocStatusSubscriptions();
    off();
    teardown = () => {};
    useNodes.getState().addNode(node("n2"));
    expect(useDocStatus.getState().dirty).toBe(false);
  });

  test("is idempotent — double install does not double-mark", () => {
    const a = installDocStatusSubscriptions();
    const b = installDocStatusSubscriptions();
    expect(a).toBe(b); // same teardown returned
    teardown = a;
    useNodes.getState().addNode(node("n3"));
    expect(useDocStatus.getState().dirty).toBe(true);
  });
});
