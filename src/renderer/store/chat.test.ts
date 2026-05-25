import { beforeEach, describe, expect, it } from "vitest";
import { useChat } from "./chat.js";

// NOTE: jsdom's Storage stub here doesn't round-trip, so these cover the
// store's in-memory behavior. Cross-restart persistence (localStorage) is
// exercised in a real browser/Electron, not this env.

beforeEach(() => {
  useChat.getState().loadFor("test-doc");
  useChat.getState().clear();
});

describe("chat store", () => {
  it("appends messages", () => {
    useChat.getState().addMessage({ role: "user", content: "hi" });
    useChat.getState().addMessage({ role: "assistant", content: "hello" });
    expect(useChat.getState().messages.map((m) => m.content)).toEqual(["hi", "hello"]);
  });

  it("accumulates usage", () => {
    useChat.getState().addUsage({ inputTokens: 10, outputTokens: 5 });
    useChat.getState().addUsage({ inputTokens: 3, outputTokens: 2 });
    expect(useChat.getState().usage).toEqual({ inputTokens: 13, outputTokens: 7 });
  });

  it("clear empties the thread and usage", () => {
    useChat.getState().addMessage({ role: "user", content: "x" });
    useChat.getState().addUsage({ inputTokens: 4, outputTokens: 1 });
    useChat.getState().clear();
    expect(useChat.getState().messages).toHaveLength(0);
    expect(useChat.getState().usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("loadFor switches the active doc key", () => {
    useChat.getState().loadFor("other-doc");
    expect(useChat.getState().docKey).toBe("other-doc");
  });
});
