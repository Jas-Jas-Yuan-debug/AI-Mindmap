// AnthropicProvider — real Claude calls via @anthropic-ai/sdk, main-process only.
//
// - Model: claude-opus-4-7 (default; see provider.ts).
// - Prompt caching: the system prompt is sent as a cache_control block so
//   repeated calls with the same system prefix hit the cache (~0.1x input cost).
// - Streaming: uses client.messages.stream(); yields text deltas.
// - Errors: mapped to the friendly AIError.kind classification via the SDK's
//   typed exception classes (never string-match error messages).
//
// The API key is read from the encrypted key store at call time — it lives in
// this process only and is never exposed to the renderer.

import Anthropic from "@anthropic-ai/sdk";
import type { AIChunk, AIProvider, AIRequest, AIResponse } from "./provider.js";
import { DEFAULT_MAX_TOKENS, DEFAULT_MODEL } from "./provider.js";
import { MissingKeyError } from "./errors.js";
import { hasKey as keyExists, readKey } from "./keyStore.js";

export { MissingKeyError, classifyError } from "./errors.js";

async function makeClient(): Promise<Anthropic> {
  const key = await readKey();
  if (!key) throw new MissingKeyError();
  return new Anthropic({ apiKey: key });
}

/** System prompt with a cache breakpoint (only when non-empty). */
function systemParam(system: string | undefined) {
  if (!system) return undefined;
  return [
    {
      type: "text" as const,
      text: system,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  async hasKey(): Promise<boolean> {
    return keyExists();
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    const client = await makeClient();
    const res = await client.messages.create({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(systemParam(req.system) ? { system: systemParam(req.system) } : {}),
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      text,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadInputTokens: res.usage.cache_read_input_tokens ?? undefined,
        cacheCreationInputTokens: res.usage.cache_creation_input_tokens ?? undefined,
      },
    };
  }

  async *stream(req: AIRequest): AsyncIterable<AIChunk> {
    const client = await makeClient();
    const s = client.messages.stream({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(systemParam(req.system) ? { system: systemParam(req.system) } : {}),
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    for await (const event of s) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { delta: event.delta.text, done: false };
      }
    }
    yield { delta: "", done: true };
  }
}
