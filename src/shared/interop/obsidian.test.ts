// Tests for the Obsidian Canvas ↔ AimapFile converters.
//
// Coverage:
//  1. Canvas → mindmap: all supported node types (text, link, group) + edges
//  2. Canvas → mindmap: bad / malformed input returns a valid empty AimapFile
//     without throwing.
//  3. mindmap → Canvas: ShapeNode with text is exported as a "text" Canvas node.
//  4. Round-trip: Canvas → mindmap → Canvas preserves the supported node types
//     and edges structurally.

import { describe, expect, test } from "vitest";
import { obsidianToMindmap, mindmapToObsidian } from "./obsidian.js";
import type { AimapFile } from "../aimap.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A small valid JSON Canvas document (text + link + group + one edge). */
const sampleCanvas = {
  nodes: [
    {
      id: "n-text",
      type: "text",
      x: 0,
      y: 0,
      width: 240,
      height: 80,
      text: "Hello **world**",
      color: "1",
    },
    {
      id: "n-link",
      type: "link",
      x: 300,
      y: 0,
      width: 240,
      height: 80,
      url: "https://example.com",
    },
    {
      id: "n-group",
      type: "group",
      x: -100,
      y: 200,
      width: 500,
      height: 300,
      label: "My Group",
      color: "#6965db",
    },
  ],
  edges: [
    {
      id: "e-1",
      fromNode: "n-text",
      fromSide: "right",
      toNode: "n-link",
      toSide: "left",
      color: "2",
      label: "relates to",
    },
  ],
};

// ---------------------------------------------------------------------------
// obsidianToMindmap — bad input
// ---------------------------------------------------------------------------

describe("obsidianToMindmap — bad input never throws, returns valid AimapFile", () => {
  test("null input", () => {
    const result = obsidianToMindmap(null);
    assertEmptyValid(result);
  });

  test("empty object {}", () => {
    const result = obsidianToMindmap({});
    assertEmptyValid(result);
  });

  test("nodes is a string, not an array", () => {
    const result = obsidianToMindmap({ nodes: "x", edges: [] });
    assertEmptyValid(result);
  });

  test("edges is a number", () => {
    const result = obsidianToMindmap({ nodes: [], edges: 42 });
    assertEmptyValid(result);
  });

  test("array of non-objects in nodes is skipped", () => {
    const result = obsidianToMindmap({ nodes: [null, 1, "str", true], edges: [] });
    assertEmptyValid(result);
  });
});

/** Assert the result is a structurally valid, empty AimapFile. */
function assertEmptyValid(result: AimapFile) {
  expect(result.formatVersion).toBe(1);
  expect(result.meta.app).toBe("AI-Mindmap");
  expect(typeof result.meta.createdAt).toBe("string");
  expect(typeof result.meta.updatedAt).toBe("string");
  expect(result.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  expect(Array.isArray(result.nodes)).toBe(true);
  expect(result.nodes).toHaveLength(0);
  expect(Array.isArray(result.edges)).toBe(true);
  expect(result.edges).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// obsidianToMindmap — happy path
// ---------------------------------------------------------------------------

describe("obsidianToMindmap — converts supported node types", () => {
  const result = obsidianToMindmap(sampleCanvas);

  test("returns a valid AimapFile shell", () => {
    expect(result.formatVersion).toBe(1);
    expect(result.meta.app).toBe("AI-Mindmap");
    expect(result.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  test("converts text node", () => {
    const node = result.nodes.find((n) => n.id === "n-text");
    expect(node).toBeDefined();
    expect(node?.type).toBe("text");
    if (node?.type !== "text") return;
    expect(node.text).toBe("Hello **world**");
    expect(node.x).toBe(0);
    expect(node.y).toBe(0);
    expect(node.width).toBe(240);
    expect(node.height).toBe(80);
    expect(node.color).toBe("1");
  });

  test("converts link node", () => {
    const node = result.nodes.find((n) => n.id === "n-link");
    expect(node).toBeDefined();
    expect(node?.type).toBe("link");
    if (node?.type !== "link") return;
    expect(node.url).toBe("https://example.com");
    expect(node.x).toBe(300);
  });

  test("converts group node with label and hex color", () => {
    const node = result.nodes.find((n) => n.id === "n-group");
    expect(node).toBeDefined();
    expect(node?.type).toBe("group");
    if (node?.type !== "group") return;
    expect(node.label).toBe("My Group");
    expect(node.color).toBe("#6965db");
    expect(node.x).toBe(-100);
    expect(node.width).toBe(500);
  });

  test("converts edge with sides, color, and label", () => {
    const edge = result.edges.find((e) => e.id === "e-1");
    expect(edge).toBeDefined();
    expect(edge?.fromNode).toBe("n-text");
    expect(edge?.toNode).toBe("n-link");
    expect(edge?.fromSide).toBe("right");
    expect(edge?.toSide).toBe("left");
    expect(edge?.color).toBe("2");
    expect(edge?.label).toBe("relates to");
  });

  test("preserves node count (3 nodes)", () => {
    expect(result.nodes).toHaveLength(3);
  });

  test("preserves edge count (1 edge)", () => {
    expect(result.edges).toHaveLength(1);
  });
});

test("obsidianToMindmap mints ids for nodes missing an id", () => {
  const raw = {
    nodes: [{ type: "text", x: 0, y: 0, width: 100, height: 50, text: "hi" }],
    edges: [],
  };
  const result = obsidianToMindmap(raw);
  expect(result.nodes).toHaveLength(1);
  expect(typeof result.nodes[0]!.id).toBe("string");
  expect(result.nodes[0]!.id.length).toBeGreaterThan(0);
});

test("obsidianToMindmap uses default dimensions when width/height missing", () => {
  const raw = {
    nodes: [{ id: "x", type: "text", x: 10, y: 20, text: "no size" }],
    edges: [],
  };
  const result = obsidianToMindmap(raw);
  expect(result.nodes[0]!.width).toBe(240);
  expect(result.nodes[0]!.height).toBe(80);
});

test("obsidianToMindmap skips unknown node types silently", () => {
  const raw = {
    nodes: [
      { id: "a", type: "text", x: 0, y: 0, text: "ok" },
      { id: "b", type: "video", x: 0, y: 0, src: "movie.mp4" }, // unsupported
    ],
    edges: [],
  };
  const result = obsidianToMindmap(raw);
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.id).toBe("a");
});

test("obsidianToMindmap derives FileNode.displayName from basename", () => {
  const raw = {
    nodes: [
      {
        id: "f1",
        type: "file",
        x: 0,
        y: 0,
        width: 200,
        height: 60,
        file: "docs/notes/roadmap.md",
      },
    ],
    edges: [],
  };
  const result = obsidianToMindmap(raw);
  const node = result.nodes[0];
  expect(node?.type).toBe("file");
  if (node?.type !== "file") return;
  expect(node.file).toBe("docs/notes/roadmap.md");
  expect(node.displayName).toBe("roadmap");
});

// ---------------------------------------------------------------------------
// mindmapToObsidian — ShapeNode → text node (lossy fallback)
// ---------------------------------------------------------------------------

describe("mindmapToObsidian — ShapeNode exported as text node", () => {
  const fileWithShape: AimapFile = {
    formatVersion: 1,
    meta: {
      app: "AI-Mindmap",
      appVersion: "0.1.0",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "s1",
        type: "shape",
        shape: "ellipse",
        x: 50,
        y: 50,
        width: 200,
        height: 100,
        text: "My Shape Label",
      },
    ],
    edges: [],
  };

  test("ShapeNode with text → canvas text node with that text", () => {
    const out = mindmapToObsidian(fileWithShape);
    expect(out.nodes).toHaveLength(1);
    const n = out.nodes[0] as Record<string, unknown>;
    expect(n["type"]).toBe("text");
    expect(n["text"]).toBe("My Shape Label");
    expect(n["id"]).toBe("s1");
  });

  test("ShapeNode without text → canvas text node with empty string", () => {
    const fileNoText: AimapFile = {
      ...fileWithShape,
      nodes: [
        {
          id: "s2",
          type: "shape",
          shape: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        },
      ],
    };
    const out = mindmapToObsidian(fileNoText);
    const n = out.nodes[0] as Record<string, unknown>;
    expect(n["type"]).toBe("text");
    expect(n["text"]).toBe("");
  });
});

// ---------------------------------------------------------------------------
// mindmapToObsidian — LinearNode and DrawNode are skipped
// ---------------------------------------------------------------------------

test("mindmapToObsidian skips LinearNode and DrawNode", () => {
  const file: AimapFile = {
    formatVersion: 1,
    meta: {
      app: "AI-Mindmap",
      appVersion: "0.1.0",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "lin1",
        type: "linear",
        linear: "arrow",
        x: 0,
        y: 0,
        width: 200,
        height: 10,
        points: [0, 0, 200, 0],
      },
      {
        id: "draw1",
        type: "draw",
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        points: [0, 0, 10, 10, 20, 5],
      },
      {
        id: "txt1",
        type: "text",
        x: 0,
        y: 200,
        width: 150,
        height: 60,
        text: "keep me",
      },
    ],
    edges: [],
  };

  const out = mindmapToObsidian(file);
  expect(out.nodes).toHaveLength(1);
  const n = out.nodes[0] as Record<string, unknown>;
  expect(n["id"]).toBe("txt1");
});

// ---------------------------------------------------------------------------
// Round-trip: Canvas → mindmap → Canvas
// ---------------------------------------------------------------------------

describe("round-trip: Canvas → mindmap → Canvas", () => {
  const mindmap = obsidianToMindmap(sampleCanvas);
  const canvas = mindmapToObsidian(mindmap);

  test("same number of nodes round-trips through supported types", () => {
    // All three sample nodes (text, link, group) are supported → all preserved.
    expect(canvas.nodes).toHaveLength(3);
  });

  test("same number of edges", () => {
    expect(canvas.edges).toHaveLength(1);
  });

  test("text node id and type preserved", () => {
    const node = (canvas.nodes as Record<string, unknown>[]).find(
      (n) => n["id"] === "n-text",
    );
    expect(node).toBeDefined();
    expect(node!["type"]).toBe("text");
    expect(node!["text"]).toBe("Hello **world**");
  });

  test("link node url preserved", () => {
    const node = (canvas.nodes as Record<string, unknown>[]).find(
      (n) => n["id"] === "n-link",
    );
    expect(node).toBeDefined();
    expect(node!["url"]).toBe("https://example.com");
  });

  test("group node label preserved", () => {
    const node = (canvas.nodes as Record<string, unknown>[]).find(
      (n) => n["id"] === "n-group",
    );
    expect(node).toBeDefined();
    expect(node!["label"]).toBe("My Group");
  });

  test("edge ids, sides, color and label preserved", () => {
    const edge = (canvas.edges as Record<string, unknown>[]).find(
      (e) => e["id"] === "e-1",
    );
    expect(edge).toBeDefined();
    expect(edge!["fromNode"]).toBe("n-text");
    expect(edge!["toNode"]).toBe("n-link");
    expect(edge!["fromSide"]).toBe("right");
    expect(edge!["toSide"]).toBe("left");
    expect(edge!["color"]).toBe("2");
    expect(edge!["label"]).toBe("relates to");
  });

  test("positions and dimensions preserved through round-trip", () => {
    const node = (canvas.nodes as Record<string, unknown>[]).find(
      (n) => n["id"] === "n-text",
    );
    expect(node!["x"]).toBe(0);
    expect(node!["y"]).toBe(0);
    expect(node!["width"]).toBe(240);
    expect(node!["height"]).toBe(80);
  });
});
