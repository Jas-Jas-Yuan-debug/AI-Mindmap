// Provider registry / factory (Phase 9b). Maps a ProviderId to a live
// AIProvider, injecting the per-provider credential resolver so every provider
// reads its secret from the encrypted store at call time. Main-process only.

import type { AIProvider } from "./provider.js";
import type { ProviderId } from "./types.js";
import { getCredential } from "./credentials.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import { GoogleProvider } from "./providers/google.js";
import { MiniMaxProvider } from "./providers/minimax.js";
import { KimiProvider } from "./providers/kimi.js";

/** Build the AIProvider for `id`, bound to its credential in the store. */
export function getProvider(id: ProviderId): AIProvider {
  const resolve = () => getCredential(id);
  switch (id) {
    case "anthropic":
      return new AnthropicProvider(resolve);
    case "openai":
      return new OpenAIProvider(resolve);
    case "google":
      return new GoogleProvider(resolve);
    case "minimax":
      return new MiniMaxProvider(resolve);
    case "kimi":
      return new KimiProvider(resolve);
  }
}
