import { describe, expect, it } from "vitest";
import { matchNodes, searchableText } from "./searchNodes.js";
import type { AimapNode } from "../store/nodes.js";

const base = { x: 0, y: 0, width: 100, height: 50 } as const;
const nodes: AimapNode[] = [
  { ...base, id: "t1", type: "text", text: "Hello World" },
  { ...base, id: "g1", type: "group", label: "Project Alpha" },
  { ...base, id: "l1", type: "link", url: "https://anthropic.com", title: "Anthropic" },
  { ...base, id: "f1", type: "file", file: "/docs/report.pdf", displayName: "report.pdf" },
  { ...base, id: "i1", type: "image", file: "data:...", alt: "diagram" },
];

describe("searchableText", () => {
  it("extracts per-type text", () => {
    expect(searchableText(nodes[0]!)).toBe("Hello World");
    expect(searchableText(nodes[1]!)).toBe("Project Alpha");
    expect(searchableText(nodes[2]!)).toContain("anthropic.com");
    expect(searchableText(nodes[3]!)).toBe("report.pdf");
    expect(searchableText(nodes[4]!)).toBe("diagram");
  });
});

describe("matchNodes", () => {
  it("is case-insensitive substring, document order", () => {
    expect(matchNodes(nodes, "o")).toEqual(["t1", "g1", "l1", "f1"]);
    expect(matchNodes(nodes, "ALPHA")).toEqual(["g1"]);
    expect(matchNodes(nodes, "anthropic")).toEqual(["l1"]);
    expect(matchNodes(nodes, "diagram")).toEqual(["i1"]);
  });
  it("empty query matches nothing", () => {
    expect(matchNodes(nodes, "")).toEqual([]);
    expect(matchNodes(nodes, "   ")).toEqual([]);
  });
  it("no match returns empty", () => {
    expect(matchNodes(nodes, "zzz")).toEqual([]);
  });
});
