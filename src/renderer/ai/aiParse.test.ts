import { describe, expect, it } from "vitest";
import {
  extractJson,
  parseExpand,
  parseGenerated,
  parseSuggestions,
  estimateTokens,
} from "./aiParse.js";

describe("extractJson", () => {
  it("parses clean JSON", () => {
    expect(extractJson('["a","b"]')).toEqual(["a", "b"]);
  });
  it("strips ```json fences", () => {
    expect(extractJson('```json\n{"x":1}\n```')).toEqual({ x: 1 });
  });
  it("extracts JSON embedded in prose", () => {
    expect(extractJson('Here you go: [1,2,3] hope that helps')).toEqual([1, 2, 3]);
  });
  it("returns null on garbage", () => {
    expect(extractJson("no json here")).toBeNull();
  });
});

describe("parseExpand", () => {
  it("parses a JSON array of topics", () => {
    expect(parseExpand('["A","B","C"]')).toEqual(["A", "B", "C"]);
  });
  it("falls back to bullet/line splitting", () => {
    expect(parseExpand("- One\n- Two\n3. Three")).toEqual(["One", "Two", "Three"]);
  });
  it("caps at 6", () => {
    expect(parseExpand('["1","2","3","4","5","6","7","8"]').length).toBe(6);
  });
});

describe("parseGenerated", () => {
  it("parses nodes + valid edges, drops out-of-range edges", () => {
    const g = parseGenerated(
      '{"nodes":[{"text":"a"},{"text":"b"}],"edges":[{"from":0,"to":1,"label":"x"},{"from":0,"to":5}]}',
    );
    expect(g.nodes).toEqual([{ text: "a" }, { text: "b" }]);
    expect(g.edges).toEqual([{ from: 0, to: 1, label: "x" }]);
  });
  it("returns empty on malformed input", () => {
    expect(parseGenerated("nope")).toEqual({ nodes: [], edges: [] });
  });
});

describe("parseSuggestions", () => {
  it("keeps only suggestions referencing known ids", () => {
    const ids = new Set(["a", "b"]);
    const out = parseSuggestions(
      '[{"from":"a","to":"b","label":"r"},{"from":"a","to":"zzz"},{"from":"a","to":"a"}]',
      ids,
    );
    expect(out).toEqual([{ from: "a", to: "b", label: "r" }]);
  });
});

describe("estimateTokens", () => {
  it("approximates ~4 chars/token", () => {
    expect(estimateTokens("12345678")).toBe(2);
  });
});
