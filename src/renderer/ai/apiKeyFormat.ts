import type { ProviderId } from "../../shared/platform.js";

/**
 * Returns null if the key looks plausible for the provider, else a short
 * warning string.  Empty/whitespace → null (no warning; emptiness handled
 * elsewhere).  This is a purely informational, NON-blocking validator —
 * the UI may show the warning but must never prevent saving.
 */
export function apiKeyWarning(provider: ProviderId, key: string): string | null {
  const trimmed = key.trim();
  if (trimmed === "") return null;

  switch (provider) {
    case "anthropic":
      return trimmed.startsWith("sk-ant-")
        ? null
        : "Anthropic keys usually start with sk-ant-";

    case "openai":
      return trimmed.startsWith("sk-")
        ? null
        : "OpenAI keys usually start with sk-";

    case "google":
      return trimmed.startsWith("AIza")
        ? null
        : "Google AI Studio keys usually start with AIza";

    case "minimax":
      // MiniMax keys are JWTs: three Base64url segments separated by two dots,
      // and the header segment starts with "ey" (base64url of `{"…`).
      return trimmed.startsWith("ey") && trimmed.split(".").length >= 3
        ? null
        : "MiniMax keys are usually a long JWT (eyJ…).";

    case "kimi":
      return trimmed.startsWith("sk-")
        ? null
        : "Moonshot/Kimi keys usually start with sk-";

    default: {
      // TypeScript exhaustiveness guard — should never be reached at runtime
      // if ProviderId stays in sync with the switch arms above.
      const _exhaustive: never = provider;
      void _exhaustive;
      return null;
    }
  }
}
