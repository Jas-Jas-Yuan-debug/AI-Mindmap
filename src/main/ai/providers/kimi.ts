// kimi.ts — Kimi provider via Moonshot AI's OpenAI-compatible endpoint.
//
// Moonshot AI (moonshot.cn) is the company behind Kimi; their API is fully
// OpenAI-compatible at https://api.moonshot.cn/v1.

import type { CredentialResolver } from "./error.js";
import { OpenAICompatibleProvider } from "./openaiCompatible.js";

export class KimiProvider extends OpenAICompatibleProvider {
  constructor(resolve: CredentialResolver) {
    super(resolve, {
      name: "kimi",
      baseUrl: "https://api.moonshot.cn/v1",
      defaultModel: "kimi-k2-0711-preview",
    });
  }
}
