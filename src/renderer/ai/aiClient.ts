// Thin renderer-side AI client. Wraps window.platform.ai with no-key
// convenience so feature code doesn't repeat the guard. Keys and credentials
// live only in the main process; this module never sees or stores them.

import type {
  AIRequest,
  AIResponse,
  AIChunk,
  ProviderId,
  ProviderMeta,
  AuthStatus,
} from "../../shared/platform.js";

// ---------------------------------------------------------------------------
// Key / auth checks
// ---------------------------------------------------------------------------

export async function aiHasKey(): Promise<boolean> {
  return (await window.platform?.ai.hasKey()) ?? false;
}

/** Set (or clear, if key is empty string) the API key for the given provider. */
export async function aiSetKey(
  provider: ProviderId,
  key: string,
): Promise<void> {
  await window.platform?.ai.setKey(provider, key);
}

/** Remove all stored credentials for the given provider. */
export async function aiClearAuth(provider: ProviderId): Promise<void> {
  await window.platform?.ai.clearAuth(provider);
}

/** List all supported providers with their metadata. */
export async function aiListProviders(): Promise<ProviderMeta[]> {
  return (await window.platform?.ai.listProviders()) ?? [];
}

/** Return auth status for every provider. Returns {} when platform is absent. */
export async function aiAuthStatus(): Promise<Record<ProviderId, AuthStatus>> {
  return (await window.platform?.ai.authStatus()) ?? ({} as Record<ProviderId, AuthStatus>);
}

/** Return the currently active provider. Falls back to "anthropic" when the
 *  platform bridge is unavailable (e.g. running in plain browser mode). */
export async function aiGetActiveProvider(): Promise<ProviderId> {
  return (await window.platform?.ai.getActiveProvider()) ?? "anthropic";
}

/** Persist the active provider selection to the main process. */
export async function aiSetActiveProvider(id: ProviderId): Promise<void> {
  await window.platform?.ai.setActiveProvider(id);
}

// ---------------------------------------------------------------------------
// Completion helpers
// ---------------------------------------------------------------------------

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
