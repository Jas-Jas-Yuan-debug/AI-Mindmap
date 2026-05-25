// Deterministic mock provider — used in tests (CI never hits Anthropic) and as
// a safe default during dev when no API key is configured. Echoes a
// predictable transform of the last user message so feature code can be
// exercised end-to-end without a network call.

import type { AIChunk, AIProvider, AIRequest, AIResponse } from "./provider.js";

function lastUserText(req: AIRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m && m.role === "user") return m.content;
  }
  return "";
}

/** Build the canned reply. Exported so tests can assert against it. */
export function mockReply(req: AIRequest): string {
  const prompt = lastUserText(req).trim();
  return `[mock:${req.model ?? "default"}] ${prompt}`;
}

export class MockProvider implements AIProvider {
  readonly name = "mock";

  async complete(req: AIRequest): Promise<AIResponse> {
    const text = mockReply(req);
    return {
      text,
      usage: { inputTokens: lastUserText(req).length, outputTokens: text.length },
    };
  }

  async *stream(req: AIRequest): AsyncIterable<AIChunk> {
    const text = mockReply(req);
    // Emit a few word-chunks so streaming consumers get multiple deltas.
    for (const word of text.split(" ")) {
      yield { delta: word + " ", done: false };
    }
    yield { delta: "", done: true };
  }

  async hasKey(): Promise<boolean> {
    return true; // always usable
  }
}
