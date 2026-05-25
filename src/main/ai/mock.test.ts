import { describe, expect, it } from "vitest";
import { MockProvider, mockReply } from "./mock.js";
import type { AIRequest } from "./provider.js";

const req: AIRequest = {
  model: "test-model",
  messages: [
    { role: "user", content: "first" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "hello world" },
  ],
};

describe("MockProvider", () => {
  it("mockReply echoes the last user message with a tagged prefix", () => {
    expect(mockReply(req)).toBe("[mock:test-model] hello world");
  });

  it("complete returns the canned reply + usage", async () => {
    const p = new MockProvider();
    const r = await p.complete(req);
    expect(r.text).toBe("[mock:test-model] hello world");
    expect(r.usage?.outputTokens).toBe(r.text.length);
  });

  it("stream yields deltas then a final done chunk", async () => {
    const p = new MockProvider();
    const chunks: { delta: string; done: boolean }[] = [];
    for await (const c of p.stream(req)) chunks.push(c);
    expect(chunks[chunks.length - 1]).toEqual({ delta: "", done: true });
    const joined = chunks.map((c) => c.delta).join("").trim();
    expect(joined).toBe("[mock:test-model] hello world");
  });

  it("hasKey is always true", async () => {
    expect(await new MockProvider().hasKey()).toBe(true);
  });
});
