// Thin renderer-side AI client. Wraps window.platform.ai with no-key
// convenience so Phase 10/11 feature code doesn't repeat the guard. The key
// lives only in the main process; this never sees it.

import type { AIRequest, AIResponse, AIChunk } from "../../shared/platform.js";

export async function aiHasKey(): Promise<boolean> {
  return (await window.platform?.ai.hasKey()) ?? false;
}

export async function aiSetKey(key: string): Promise<void> {
  await window.platform?.ai.setKey(key);
}

/** One-shot completion. Throws (with a classified message) on failure. */
export async function aiComplete(req: AIRequest): Promise<AIResponse> {
  const p = window.platform;
  if (!p) throw new Error("Platform unavailable.");
  return p.ai.complete(req);
}

/** Streamed completion — yields text deltas then a final {done:true}. */
export function aiStream(req: AIRequest): AsyncIterable<AIChunk> {
  const p = window.platform;
  if (!p) {
    return (async function* () {
      throw new Error("Platform unavailable.");
    })();
  }
  return p.ai.stream(req);
}
