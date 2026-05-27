// AnthropicProvider — real Claude calls via @anthropic-ai/sdk, main-process only.
//
// - Model: claude-opus-4-7 (default; see provider.ts).
// - Prompt caching: the system prompt is sent as a cache_control block so
//   repeated calls with the same system prefix hit the cache (~0.1x input cost).
// - Streaming: uses client.messages.stream(); yields text deltas.
// - Errors: mapped to the friendly AIError.kind classification via the SDK's
//   typed exception classes (never string-match error messages).
//
// Auth: the credential is resolved at call time via the injected resolver
// (Phase 9b — the registry passes `() => getCredential("anthropic")`). An API
// key uses `apiKey`; an OAuth bundle uses the SDK's `authToken` (Bearer). The
// secret lives in this process only and is never exposed to the renderer.

import Anthropic from "@anthropic-ai/sdk";
import type { AIChunk, AIProvider, AIRequest, AIResponse } from "./provider.js";
import { DEFAULT_MAX_TOKENS, DEFAULT_MODEL } from "./provider.js";
import { MissingKeyError } from "./errors.js";
import type { CredentialResolver } from "./providers/error.js";

export { MissingKeyError, classifyError } from "./errors.js";

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

  constructor(private readonly resolve: CredentialResolver) {}

  async hasKey(): Promise<boolean> {
    return (await this.resolve()) != null;
  }

  /** Build an SDK client from the resolved credential (apiKey or OAuth). */
  private async makeClient(): Promise<Anthropic> {
    const cred = await this.resolve();
    if (!cred) throw new MissingKeyError();
    return cred.type === "apiKey"
      ? new Anthropic({ apiKey: cred.key })
      : new Anthropic({ authToken: cred.accessToken });
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    const client = await this.makeClient();
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
    const client = await this.makeClient();
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
