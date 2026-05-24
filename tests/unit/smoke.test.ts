import { describe, it, expect } from "vitest";
import type { JSONCanvas } from "../../src/shared/jsoncanvas.js";

describe("smoke", () => {
  it("a minimal JSON Canvas value satisfies the type", () => {
    const sample: JSONCanvas = {
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
    expect(sample.nodes?.[0]?.id).toBe("a");
  });
});
