/**
 * Tests for src/shared/interop/excalidraw.ts
 *
 * Run with:  npx vitest src/shared/interop/excalidraw.test.ts
 */

import { describe, it, expect } from "vitest";
import { excalidrawToMindmap, mindmapToExcalidraw } from "./excalidraw.js";
import type { AimapFile, ShapeNode, LinearNode, DrawNode, TextNode } from "../aimap.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalAimap(nodes: AimapFile["nodes"]): AimapFile {
  return {
    formatVersion: 1,
    meta: {
      app: "AI-Mindmap",
      appVersion: "0.1.0",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges: [],
  };
}

// ---------------------------------------------------------------------------
// excalidrawToMindmap
// ---------------------------------------------------------------------------

describe("excalidrawToMindmap", () => {
  const sampleScene = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
    elements: [
      {
        id: "rect-1",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        angle: 0,
        strokeColor: "#e03131",
        backgroundColor: "#f08c00",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "dashed",
        roughness: 1,
        opacity: 80,
        groupIds: [],
        roundness: null,
        seed: 1,
        version: 1,
        versionNonce: 0,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
      },
      {
        id: "arrow-1",
        type: "arrow",
        x: 50,
        y: 50,
        width: 150,
        height: 0,
        angle: 0,
        strokeColor: "#1e1e1e",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        roundness: null,
        seed: 2,
        version: 1,
        versionNonce: 0,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
        points: [
          [0, 0],
          [150, 0],
          [150, 80],
        ] as [number, number][],
        lastCommittedPoint: null,
      },
      {
        id: "draw-1",
        type: "freedraw",
        x: 5,
        y: 5,
        width: 80,
        height: 40,
        angle: 0,
        strokeColor: "#1e1e1e",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        roundness: null,
        seed: 3,
        version: 1,
        versionNonce: 0,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
        points: [
          [0, 0],
          [10, 5],
          [20, 10],
          [30, 5],
        ] as [number, number][],
        lastCommittedPoint: null,
      },
      {
        id: "text-1",
        type: "text",
        x: 300,
        y: 300,
        width: 120,
        height: 25,
        angle: 0,
        strokeColor: "#1e1e1e",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        roundness: null,
        seed: 4,
        version: 1,
        versionNonce: 0,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
        text: "Hello Excalidraw",
        fontSize: 20,
        fontFamily: 1,
        textAlign: "left",
        verticalAlign: "top",
        containerId: null,
        originalText: "Hello Excalidraw",
        lineHeight: 1.25,
      },
    ],
  };

  it("produces a valid AimapFile with the correct node types", () => {
    const result = excalidrawToMindmap(sampleScene);
    expect(result.formatVersion).toBe(1);
    expect(result.meta.app).toBe("AI-Mindmap");
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toEqual([]);
    expect(result.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("maps rectangle → ShapeNode with correct fields", () => {
    const result = excalidrawToMindmap(sampleScene);
    const shape = result.nodes.find((n) => n.id === "rect-1") as ShapeNode;
    expect(shape).toBeDefined();
    expect(shape.type).toBe("shape");
    expect(shape.shape).toBe("rectangle");
    expect(shape.x).toBe(10);
    expect(shape.y).toBe(20);
    expect(shape.width).toBe(200);
    expect(shape.height).toBe(100);
    expect(shape.strokeWidth).toBe(2);
    expect(shape.strokeStyle).toBe("dashed");
    expect(shape.opacity).toBe(80);
    // "#e03131" maps to preset "1"
    expect(shape.strokeColor).toBe("1");
    // "#f08c00" maps to preset "3"
    expect(shape.backgroundColor).toBe("3");
  });

  it("maps arrow → LinearNode with flattened points", () => {
    const result = excalidrawToMindmap(sampleScene);
    const linear = result.nodes.find((n) => n.id === "arrow-1") as LinearNode;
    expect(linear).toBeDefined();
    expect(linear.type).toBe("linear");
    expect(linear.linear).toBe("arrow");
    expect(linear.x).toBe(50);
    expect(linear.y).toBe(50);
    // Pairs [0,0],[150,0],[150,80] → flat [0,0,150,0,150,80]
    expect(linear.points).toEqual([0, 0, 150, 0, 150, 80]);
  });

  it("maps freedraw → DrawNode with flattened points", () => {
    const result = excalidrawToMindmap(sampleScene);
    const draw = result.nodes.find((n) => n.id === "draw-1") as DrawNode;
    expect(draw).toBeDefined();
    expect(draw.type).toBe("draw");
    // Pairs [0,0],[10,5],[20,10],[30,5] → flat
    expect(draw.points).toEqual([0, 0, 10, 5, 20, 10, 30, 5]);
  });

  it("maps text → TextNode with correct text content", () => {
    const result = excalidrawToMindmap(sampleScene);
    const text = result.nodes.find((n) => n.id === "text-1") as TextNode;
    expect(text).toBeDefined();
    expect(text.type).toBe("text");
    expect(text.text).toBe("Hello Excalidraw");
    expect(text.x).toBe(300);
    expect(text.y).toBe(300);
  });

  it("handles bad input: null → valid empty AimapFile without throwing", () => {
    const result = excalidrawToMindmap(null);
    expect(result.formatVersion).toBe(1);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("handles bad input: {} → valid empty AimapFile without throwing", () => {
    const result = excalidrawToMindmap({});
    expect(result.formatVersion).toBe(1);
    expect(result.nodes).toEqual([]);
  });

  it("handles bad input: {elements:5} → valid empty AimapFile without throwing", () => {
    const result = excalidrawToMindmap({ elements: 5 });
    expect(result.formatVersion).toBe(1);
    expect(result.nodes).toEqual([]);
  });

  it("ignores isDeleted elements", () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [
        {
          id: "deleted-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          isDeleted: true,
          strokeColor: "#1e1e1e",
          backgroundColor: "transparent",
          opacity: 100,
          strokeWidth: 1,
          strokeStyle: "solid",
        },
      ],
    };
    const result = excalidrawToMindmap(scene);
    expect(result.nodes).toHaveLength(0);
  });

  it("skips bound text elements as standalone nodes", () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [
        {
          id: "shape-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          isDeleted: false,
          strokeColor: "#1e1e1e",
          backgroundColor: "transparent",
          opacity: 100,
          strokeWidth: 1,
          strokeStyle: "solid",
        },
        {
          id: "bound-text-1",
          type: "text",
          x: 10,
          y: 40,
          width: 180,
          height: 20,
          isDeleted: false,
          strokeColor: "#1e1e1e",
          backgroundColor: "transparent",
          opacity: 100,
          strokeWidth: 1,
          strokeStyle: "solid",
          text: "inside shape",
          containerId: "shape-1",
          fontSize: 20,
          fontFamily: 1,
          textAlign: "center",
          verticalAlign: "middle",
          originalText: "inside shape",
          lineHeight: 1.25,
        },
      ],
    };
    const result = excalidrawToMindmap(scene);
    // Only the shape node — the bound text is merged into it, not a separate node
    expect(result.nodes).toHaveLength(1);
    const shape = result.nodes[0] as ShapeNode;
    expect(shape.type).toBe("shape");
    expect(shape.text).toBe("inside shape");
  });
});

// ---------------------------------------------------------------------------
// mindmapToExcalidraw
// ---------------------------------------------------------------------------

describe("mindmapToExcalidraw", () => {
  it("produces a valid .excalidraw scene structure", () => {
    const file = makeMinimalAimap([]);
    const scene = mindmapToExcalidraw(file);
    expect(scene.type).toBe("excalidraw");
    expect(scene.version).toBe(2);
    expect(typeof scene.source).toBe("string");
    expect(Array.isArray(scene.elements)).toBe(true);
    expect(scene.appState).toMatchObject({ viewBackgroundColor: "#ffffff" });
    expect(scene.files).toEqual({});
  });

  it("emits all required boilerplate fields on each element", () => {
    const shape: ShapeNode = {
      id: "s1",
      type: "shape",
      shape: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    };
    const file = makeMinimalAimap([shape]);
    const scene = mindmapToExcalidraw(file);
    const el = scene.elements[0] as Record<string, unknown>;
    // All mandatory Excalidraw fields must be present
    for (const field of [
      "id",
      "type",
      "x",
      "y",
      "width",
      "height",
      "angle",
      "strokeColor",
      "backgroundColor",
      "fillStyle",
      "strokeWidth",
      "strokeStyle",
      "roughness",
      "opacity",
      "groupIds",
      "roundness",
      "seed",
      "version",
      "versionNonce",
      "isDeleted",
      "boundElements",
      "updated",
      "link",
      "locked",
    ]) {
      expect(el).toHaveProperty(field);
    }
  });

  it("ShapeNode (rectangle) round-trips geometry", () => {
    const shape: ShapeNode = {
      id: "s1",
      type: "shape",
      shape: "rectangle",
      x: 15,
      y: 25,
      width: 200,
      height: 120,
      backgroundColor: "4",
      strokeColor: "1",
      strokeWidth: 2,
      strokeStyle: "dashed",
      opacity: 75,
    };
    const file = makeMinimalAimap([shape]);
    const scene = mindmapToExcalidraw(file);
    const el = scene.elements[0] as Record<string, unknown>;
    expect(el["type"]).toBe("rectangle");
    expect(el["x"]).toBe(15);
    expect(el["y"]).toBe(25);
    expect(el["width"]).toBe(200);
    expect(el["height"]).toBe(120);
    expect(el["strokeWidth"]).toBe(2);
    expect(el["strokeStyle"]).toBe("dashed");
    expect(el["opacity"]).toBe(75);
    // Colour preset "4" → #2f9e44
    expect(el["backgroundColor"]).toBe("#2f9e44");
    // Colour preset "1" → #e03131
    expect(el["strokeColor"]).toBe("#e03131");
  });

  it("ShapeNode → excalidraw → excalidrawToMindmap round-trip preserves geometry", () => {
    const shape: ShapeNode = {
      id: "round-s1",
      type: "shape",
      shape: "ellipse",
      x: 50,
      y: 60,
      width: 180,
      height: 90,
      strokeWidth: 4,
      strokeStyle: "dotted",
      opacity: 50,
    };
    const file = makeMinimalAimap([shape]);
    const scene = mindmapToExcalidraw(file);
    const reimported = excalidrawToMindmap(scene);
    const back = reimported.nodes.find((n) => n.id === "round-s1") as ShapeNode;
    expect(back).toBeDefined();
    expect(back.type).toBe("shape");
    expect(back.shape).toBe("ellipse");
    expect(back.x).toBe(50);
    expect(back.y).toBe(60);
    expect(back.width).toBe(180);
    expect(back.height).toBe(90);
    expect(back.strokeWidth).toBe(4);
    expect(back.strokeStyle).toBe("dotted");
    expect(back.opacity).toBe(50);
  });

  it("LinearNode round-trips points (un-flatten then re-flatten)", () => {
    const linear: LinearNode = {
      id: "l1",
      type: "linear",
      linear: "line",
      points: [0, 0, 100, 50, 200, 0],
      x: 10,
      y: 10,
      width: 200,
      height: 50,
    };
    const file = makeMinimalAimap([linear]);
    const scene = mindmapToExcalidraw(file);
    const el = scene.elements[0] as Record<string, unknown>;
    expect(el["type"]).toBe("line");
    expect(el["points"]).toEqual([
      [0, 0],
      [100, 50],
      [200, 0],
    ]);
  });

  it("LinearNode → excalidraw → excalidrawToMindmap round-trip preserves points", () => {
    const linear: LinearNode = {
      id: "round-l1",
      type: "linear",
      linear: "arrow",
      points: [0, 0, 80, 40, 160, 0],
      x: 20,
      y: 30,
      width: 160,
      height: 40,
      strokeWidth: 2,
    };
    const file = makeMinimalAimap([linear]);
    const scene = mindmapToExcalidraw(file);
    const reimported = excalidrawToMindmap(scene);
    const back = reimported.nodes.find((n) => n.id === "round-l1") as LinearNode;
    expect(back).toBeDefined();
    expect(back.type).toBe("linear");
    expect(back.linear).toBe("arrow");
    expect(back.x).toBe(20);
    expect(back.y).toBe(30);
    expect(back.points).toEqual([0, 0, 80, 40, 160, 0]);
  });

  it("DrawNode emits freedraw element with paired points", () => {
    const draw: DrawNode = {
      id: "d1",
      type: "draw",
      points: [0, 0, 5, 10, 15, 20],
      x: 0,
      y: 0,
      width: 15,
      height: 20,
    };
    const file = makeMinimalAimap([draw]);
    const scene = mindmapToExcalidraw(file);
    const el = scene.elements[0] as Record<string, unknown>;
    expect(el["type"]).toBe("freedraw");
    expect(el["points"]).toEqual([
      [0, 0],
      [5, 10],
      [15, 20],
    ]);
  });

  it("TextNode emits text element with all required text fields", () => {
    const text: TextNode = {
      id: "tx1",
      type: "text",
      text: "Hello world",
      x: 0,
      y: 0,
      width: 120,
      height: 25,
    };
    const file = makeMinimalAimap([text]);
    const scene = mindmapToExcalidraw(file);
    const el = scene.elements[0] as Record<string, unknown>;
    expect(el["type"]).toBe("text");
    expect(el["text"]).toBe("Hello world");
    expect(el["originalText"]).toBe("Hello world");
    expect(el["fontSize"]).toBe(20);
    expect(el["fontFamily"]).toBe(1);
    expect(el["textAlign"]).toBe("left");
    expect(el["verticalAlign"]).toBe("top");
    expect(el["containerId"]).toBeNull();
    expect(el["lineHeight"]).toBe(1.25);
  });
});

// ---------------------------------------------------------------------------
// Bad-input resilience
// ---------------------------------------------------------------------------

describe("bad input resilience", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["string", "hello"],
    ["empty object", {}],
    ["elements is a number", { elements: 5 }],
    ["elements has garbage entries", { elements: [null, 123, "str", { type: "unknown" }] }],
  ])("excalidrawToMindmap(%s) never throws and returns a valid empty file", (_label, input) => {
    let result: ReturnType<typeof excalidrawToMindmap> | undefined;
    expect(() => {
      result = excalidrawToMindmap(input);
    }).not.toThrow();
    expect(result).toBeDefined();
    expect(result!.formatVersion).toBe(1);
    expect(Array.isArray(result!.nodes)).toBe(true);
    expect(Array.isArray(result!.edges)).toBe(true);
  });
});
