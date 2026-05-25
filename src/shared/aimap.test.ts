// Unit tests for the .aimap schema (Zod validation), serialize/deserialize
// round-trip, and the migration scaffold. Phase 5 (PR 1/3).

import { describe, expect, it } from "vitest";
import {
  AIMAP_FORMAT_VERSION,
  type AimapFile,
  makeId,
  parseAimapFile,
} from "./aimap.js";
import { fromAimapFile, toAimapFile } from "./serialize.js";
import { migrate, MigrationError, MIGRATIONS } from "./migrations/index.js";

// The plan §5 "minimal valid file" example.
const MINIMAL: AimapFile = {
  formatVersion: 1,
  meta: {
    app: "AI-Mindmap",
    appVersion: "0.1.0",
    createdAt: "2026-05-24T08:00:00Z",
    updatedAt: "2026-05-24T08:00:00Z",
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    { id: "a", type: "text", x: 0, y: 0, width: 240, height: 80, text: "# Hello" },
    {
      id: "b",
      type: "link",
      x: 320,
      y: 0,
      width: 240,
      height: 80,
      url: "https://anthropic.com",
      color: "5",
    },
  ],
  edges: [
    {
      id: "e1",
      fromNode: "a",
      fromSide: "right",
      toNode: "b",
      toSide: "left",
      label: "see",
    },
  ],
};

describe("parseAimapFile — valid documents", () => {
  it("parses the plan §5 minimal valid file", () => {
    const res = parseAimapFile(MINIMAL);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.nodes).toHaveLength(2);
      expect(res.data.edges).toHaveLength(1);
      expect(res.data.formatVersion).toBe(AIMAP_FORMAT_VERSION);
    }
  });

  it("accepts an empty (but valid) document with no nodes or edges", () => {
    const empty: AimapFile = {
      formatVersion: 1,
      meta: MINIMAL.meta,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    };
    expect(parseAimapFile(empty).ok).toBe(true);
  });

  it("accepts all node variants in the discriminated union", () => {
    const doc: AimapFile = {
      ...MINIMAL,
      nodes: [
        { id: "t", type: "text", x: 0, y: 0, width: 10, height: 10, text: "x" },
        { id: "f", type: "file", x: 0, y: 0, width: 10, height: 10, file: "a.md" },
        { id: "l", type: "link", x: 0, y: 0, width: 10, height: 10, url: "https://x" },
        { id: "i", type: "image", x: 0, y: 0, width: 10, height: 10, file: "a.png" },
        { id: "g", type: "group", x: 0, y: 0, width: 10, height: 10, label: "G" },
      ],
      edges: [],
    };
    expect(parseAimapFile(doc).ok).toBe(true);
  });

  it("accepts both hex and preset colors", () => {
    const doc: AimapFile = {
      ...MINIMAL,
      nodes: [
        { id: "1", type: "text", x: 0, y: 0, width: 10, height: 10, text: "a", color: "#6965db" },
        { id: "2", type: "text", x: 0, y: 0, width: 10, height: 10, text: "b", color: "3" },
      ],
      edges: [],
    };
    expect(parseAimapFile(doc).ok).toBe(true);
  });

  it("accepts an optional chats array", () => {
    const doc: AimapFile = {
      ...MINIMAL,
      chats: [
        {
          id: "c1",
          createdAt: "2026-05-24T08:00:00Z",
          messages: [{ role: "user", content: "hi", ts: "2026-05-24T08:00:01Z" }],
        },
      ],
    };
    expect(parseAimapFile(doc).ok).toBe(true);
  });
});

describe("parseAimapFile — invalid documents", () => {
  it("fails when a required field is missing, with a useful issue path", () => {
    const bad = {
      ...MINIMAL,
      nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 240, text: "# Hello" }], // missing height
    };
    const res = parseAimapFile(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.length).toBeGreaterThan(0);
      expect(res.issues.some((i) => i.path.includes("height"))).toBe(true);
      expect(res.error).toMatch(/height/);
    }
  });

  it("fails on a wrong formatVersion", () => {
    const res = parseAimapFile({ ...MINIMAL, formatVersion: 2 });
    expect(res.ok).toBe(false);
  });

  it("fails on a bad node type discriminant", () => {
    const res = parseAimapFile({
      ...MINIMAL,
      nodes: [{ id: "a", type: "sticky", x: 0, y: 0, width: 1, height: 1 }],
      edges: [],
    });
    expect(res.ok).toBe(false);
  });

  it("fails on a non-object input (null / string / number)", () => {
    expect(parseAimapFile(null).ok).toBe(false);
    expect(parseAimapFile("nope").ok).toBe(false);
    expect(parseAimapFile(42).ok).toBe(false);
  });

  it("never throws — returns a structured result on garbage", () => {
    expect(() => parseAimapFile({ wat: true })).not.toThrow();
    const res = parseAimapFile({ wat: true });
    expect(res.ok).toBe(false);
  });
});

describe("parseAimapFile — unknown fields are dropped", () => {
  it("strips unknown root + node fields on parse", () => {
    const withExtra = {
      ...MINIMAL,
      somethingExtra: "drop me",
      nodes: [
        {
          id: "a",
          type: "text",
          x: 0,
          y: 0,
          width: 240,
          height: 80,
          text: "# Hi",
          legacyField: 123,
        },
      ],
      edges: [],
    };
    const res = parseAimapFile(withExtra);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect("somethingExtra" in res.data).toBe(false);
      expect("legacyField" in res.data.nodes[0]!).toBe(false);
    }
  });
});

describe("serialize round-trip", () => {
  it("fromAimapFile(toAimapFile(x)) preserves nodes / edges / viewport", () => {
    const built = toAimapFile({
      nodes: MINIMAL.nodes,
      edges: MINIMAL.edges,
      viewport: MINIMAL.viewport,
    });
    const back = fromAimapFile(built);
    expect(back.nodes).toEqual(MINIMAL.nodes);
    expect(back.edges).toEqual(MINIMAL.edges);
    expect(back.viewport).toEqual(MINIMAL.viewport);
  });

  it("toAimapFile output validates against the Zod schema", () => {
    const built = toAimapFile({
      nodes: MINIMAL.nodes,
      edges: MINIMAL.edges,
      viewport: MINIMAL.viewport,
    });
    expect(parseAimapFile(built).ok).toBe(true);
  });

  it("preserves createdAt when re-saving and stamps a fresh updatedAt", () => {
    const built = toAimapFile({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: "2020-01-01T00:00:00.000Z",
      now: "2026-05-24T10:00:00.000Z",
    });
    expect(built.meta.createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(built.meta.updatedAt).toBe("2026-05-24T10:00:00.000Z");
  });

  it("preserves z-order (array order) through a round-trip", () => {
    const ordered: AimapFile["nodes"] = [
      { id: "z0", type: "text", x: 0, y: 0, width: 10, height: 10, text: "bottom" },
      { id: "z1", type: "text", x: 0, y: 0, width: 10, height: 10, text: "top" },
    ];
    const built = toAimapFile({ nodes: ordered, edges: [], viewport: MINIMAL.viewport });
    const back = fromAimapFile(built);
    expect(back.nodes.map((n) => n.id)).toEqual(["z0", "z1"]);
  });

  it("round-trips a 50-node canvas through serialize + Zod (in-memory)", () => {
    const nodes: AimapFile["nodes"] = Array.from({ length: 50 }, (_, i) => ({
      id: `n${i}`,
      type: "text" as const,
      x: i * 10,
      y: i * 5,
      width: 200,
      height: 60,
      text: `node ${i}`,
    }));
    const built = toAimapFile({ nodes, edges: [], viewport: { x: 5, y: 6, zoom: 1.5 } });
    const parsed = parseAimapFile(built);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const back = fromAimapFile(parsed.data);
      expect(back.nodes).toEqual(nodes);
      expect(back.viewport).toEqual({ x: 5, y: 6, zoom: 1.5 });
    }
  });
});

describe("migrate", () => {
  it("has an empty registry for V1 (current version)", () => {
    expect(MIGRATIONS).toHaveLength(0);
  });

  it("passes a current-version document through and validates it", () => {
    const out = migrate(MINIMAL);
    expect(out.formatVersion).toBe(1);
    expect(out.nodes).toHaveLength(2);
  });

  it("throws MigrationError for a newer (unsupported) formatVersion", () => {
    expect(() => migrate({ ...MINIMAL, formatVersion: 99 })).toThrow(MigrationError);
  });

  it("throws MigrationError when formatVersion is missing / non-numeric", () => {
    expect(() => migrate({ meta: MINIMAL.meta })).toThrow(MigrationError);
    expect(() => migrate(null)).toThrow(MigrationError);
  });

  it("throws MigrationError when the migrated doc fails validation", () => {
    // formatVersion 1 but structurally invalid → fails final parse.
    expect(() => migrate({ formatVersion: 1, nodes: "nope" })).toThrow(MigrationError);
  });
});

describe("makeId", () => {
  it("returns unique ids", () => {
    const a = makeId("n");
    const b = makeId("n");
    expect(a).not.toBe(b);
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
  });
});
