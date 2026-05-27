// minimax.ts — MiniMax provider via their OpenAI-compatible endpoint.
//
// Base URL is the OpenAI-compatible endpoint (https://api.minimaxi.com/v1)
// and may need adjusting if MiniMax changes their API structure — check
// https://platform.minimaxi.com/document/guides/chat-model/V2 for current docs.

import type { CredentialResolver } from "./error.js";
import { OpenAICompatibleProvider } from "./openaiCompatible.js";

export class MiniMaxProvider extends OpenAICompatibleProvider {
  constructor(resolve: CredentialResolver) {
    super(resolve, {
      name: "minimax",
      baseUrl: "https://api.minimaxi.com/v1",
      defaultModel: "MiniMax-Text-01",
    });
  }
}
