import { describe, it, expect } from "vitest";
import type { AimapFile } from "../../src/shared/aimap.js";

describe("smoke", () => {
  it("a minimal .aimap value satisfies the AimapFile type", () => {
    const sample: AimapFile = {
      formatVersion: 1,
      meta: {
        app: "AI-Mindmap",
        appVersion: "0.1.0",
        createdAt: "2026-05-24T08:00:00Z",
        updatedAt: "2026-05-24T08:00:00Z",
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "a",
          type: "text",
          x: 0,
          y: 0,
          width: 240,
          height: 80,
          text: "# Hello",
        },
      ],
      edges: [],
    };
    expect(sample.nodes[0]?.id).toBe("a");
  });
});
