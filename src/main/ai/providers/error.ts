// error.ts — shared error primitives for all HTTP-based AI providers.
//
// ProviderError carries a coarse `kind` so the renderer can branch on it
// without string-matching error messages.  kindForStatus maps raw HTTP
// status codes; networkError wraps fetch/stream failures.
//
// This file also re-exports CredentialResolver so every provider file
// can import both in a single statement.

import type { StoredCredential } from "../types.js";

// Re-export for convenience so providers don't also need to import types.js.
export type { StoredCredential };

/** Resolver injected into each provider's constructor by the registry. */
export type CredentialResolver = () => Promise<StoredCredential | null>;

export type AIErrorKind =
  | "no_key"
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "network"
  | "invalid_request"
  | "unknown";

/** Thrown inside provider methods; caught by the IPC handler. */
export class ProviderError extends Error {
  constructor(
    public readonly kind: AIErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * Map an HTTP status code to an AIError kind.
 * 401/403 → auth; 429 → rate_limit; ≥500 → overloaded;
 * 400 → invalid_request; everything else → unknown.
 */
export function kindForStatus(status: number): AIErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "overloaded";
  if (status === 400) return "invalid_request";
  return "unknown";
}

/**
 * Wrap a thrown fetch / stream / TextDecoder error as a ProviderError
 * with kind "network".
 */
export function networkError(e: unknown): ProviderError {
  const msg =
    e instanceof Error ? e.message : String(e);
  return new ProviderError(
    "network",
    `Network error: ${msg}`,
  );
}
