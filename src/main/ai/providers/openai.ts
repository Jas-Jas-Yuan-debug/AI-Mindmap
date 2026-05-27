// openai.ts — OpenAI provider (GPT-4o and friends, "Codex" in-app label).
//
// Thin subclass of OpenAICompatibleProvider — OpenAI is the canonical shape
// that openaiCompatible.ts implements against, so nothing extra is needed here.

import type { CredentialResolver } from "./error.js";
import { OpenAICompatibleProvider } from "./openaiCompatible.js";

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(resolve: CredentialResolver) {
    super(resolve, {
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4o",
    });
  }
}
