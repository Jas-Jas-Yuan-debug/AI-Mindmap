// AI error classification — kept free of Electron imports so it's unit-testable
// in the node/jsdom test env. anthropic.ts and ipc/ai.ts re-use these.

import Anthropic from "@anthropic-ai/sdk";
import type { AIError } from "./provider.js";
import { ProviderError } from "./providers/error.js";

export class MissingKeyError extends Error {
  readonly kind = "no_key" as const;
  constructor() {
    super("No Anthropic API key configured. Add one in Settings.");
  }
}

/** Map an SDK/throw into the coarse AIError.kind the renderer can branch on. */
export function classifyError(err: unknown): AIError {
  if (err instanceof MissingKeyError) return { kind: "no_key", message: err.message };
  // HTTP providers (OpenAI / Google / MiniMax / Kimi) throw ProviderError with
  // a pre-classified kind — trust it directly.
  if (err instanceof ProviderError) return { kind: err.kind, message: err.message };
  if (err instanceof Anthropic.AuthenticationError)
    return { kind: "auth", message: "Invalid API key. Check it in Settings." };
  if (err instanceof Anthropic.PermissionDeniedError)
    return { kind: "auth", message: "This API key lacks permission for that model." };
  if (err instanceof Anthropic.RateLimitError)
    return { kind: "rate_limit", message: "Rate limited. Wait a moment and retry." };
  if (err instanceof Anthropic.InternalServerError)
    return { kind: "overloaded", message: "Anthropic is busy right now. Retry shortly." };
  if (err instanceof Anthropic.BadRequestError)
    return { kind: "invalid_request", message: err.message };
  if (err instanceof Anthropic.APIConnectionError)
    return { kind: "network", message: "Couldn't reach Anthropic. Check your connection." };
  if (err instanceof Anthropic.APIError)
    return { kind: "unknown", message: err.message };
  return { kind: "unknown", message: err instanceof Error ? err.message : String(err) };
}
