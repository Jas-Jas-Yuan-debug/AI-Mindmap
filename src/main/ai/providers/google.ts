// google.ts — Google Gemini provider via the Generative Language REST API.
//
// Gemini's REST API is NOT OpenAI-shaped, so this is a standalone
// implementation rather than a subclass of OpenAICompatibleProvider.
//
// Auth:
//   - API key (apiKey cred): passed as the `?key=<token>` query param.
//   - OAuth (oauth cred):    `Authorization: Bearer <accessToken>` header,
//                            no `?key=` query param.
//
// Endpoint base: https://generativelanguage.googleapis.com/v1beta/models/
//   complete → POST  /<model>:generateContent
//   stream   → POST  /<model>:streamGenerateContent?alt=sse   (SSE)

import type { AIChunk, AIProvider, AIRequest, AIResponse } from "../provider.js";
import { DEFAULT_MAX_TOKENS } from "../provider.js";
import type { CredentialResolver } from "./error.js";
import { kindForStatus, networkError, ProviderError } from "./error.js";
import { sseData } from "./sse.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.0-flash";

/** A single Gemini content part (only text parts used here). */
interface GeminiPart {
  text: string;
}

/** A single Gemini content turn. */
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** Shape of a Gemini generateContent / streamGenerateContent response chunk. */
interface GeminiResponseChunk {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

export class GoogleProvider implements AIProvider {
  readonly name = "google";

  constructor(private readonly resolve: CredentialResolver) {}

  async hasKey(): Promise<boolean> {
    return (await this.resolve()) != null;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the URL for a Gemini method, appending `?key=<token>` for apiKey
   * credentials (already encoded into the URL before any fetch call).
   */
  private async buildUrl(model: string, method: string, extraParams?: string): Promise<{ url: string; headers: Record<string, string> }> {
    const cred = await this.resolve();
    if (!cred) {
      throw new ProviderError(
        "no_key",
        "Google is not configured. Add a key in Settings.",
      );
    }

    if (cred.type === "apiKey") {
      const params = extraParams ? `${extraParams}&key=${encodeURIComponent(cred.key)}` : `?key=${encodeURIComponent(cred.key)}`;
      return {
        url: `${BASE}/${encodeURIComponent(model)}:${method}${params}`,
        headers: { "Content-Type": "application/json" },
      };
    } else {
      // OAuth — key goes in the Authorization header, not the URL.
      const params = extraParams ?? "";
      return {
        url: `${BASE}/${encodeURIComponent(model)}:${method}${params}`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cred.accessToken}`,
        },
      };
    }
  }

  /** Map req.messages to Gemini's content array (user/model roles). */
  private buildContents(req: AIRequest): GeminiContent[] {
    return req.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  }

  /** Build the full request body for both complete and stream. */
  private buildBody(req: AIRequest): object {
    return {
      contents: this.buildContents(req),
      ...(req.system
        ? { systemInstruction: { parts: [{ text: req.system }] } }
        : {}),
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
    };
  }

  /** Extract a friendly error message from a non-OK Gemini response body. */
  private async errorMessage(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as {
        error?: { message?: string; status?: string };
        message?: string;
      };
      return body.error?.message ?? body.message ?? res.statusText;
    } catch {
      return res.statusText;
    }
  }

  // ---------------------------------------------------------------------------
  // AIProvider implementation
  // ---------------------------------------------------------------------------

  async complete(req: AIRequest): Promise<AIResponse> {
    const model = req.model ?? DEFAULT_MODEL;
    let res: Response;
    try {
      const { url, headers } = await this.buildUrl(model, "generateContent");
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(this.buildBody(req)),
      });
    } catch (e) {
      throw networkError(e);
    }

    if (!res.ok) {
      const msg = await this.errorMessage(res);
      throw new ProviderError(kindForStatus(res.status), msg);
    }

    const json = (await res.json()) as GeminiResponseChunk;

    const text =
      json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .join("") ?? "";

    return {
      text,
      ...(json.usageMetadata
        ? {
            usage: {
              inputTokens: json.usageMetadata.promptTokenCount ?? 0,
              outputTokens: json.usageMetadata.candidatesTokenCount ?? 0,
            },
          }
        : {}),
    };
  }

  async *stream(req: AIRequest): AsyncIterable<AIChunk> {
    const model = req.model ?? DEFAULT_MODEL;
    let res: Response;
    try {
      // ?alt=sse triggers SSE streaming; key param (if apiKey) must come after.
      const { url, headers } = await this.buildUrl(model, "streamGenerateContent", "?alt=sse");
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(this.buildBody(req)),
      });
    } catch (e) {
      throw networkError(e);
    }

    if (!res.ok) {
      const msg = await this.errorMessage(res);
      throw new ProviderError(kindForStatus(res.status), msg);
    }

    try {
      for await (const payload of sseData(res)) {
        let chunk: GeminiResponseChunk;
        try {
          chunk = JSON.parse(payload) as GeminiResponseChunk;
        } catch {
          continue; // skip malformed lines
        }
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.text) {
              yield { delta: part.text, done: false };
            }
          }
        }
      }
    } catch (e) {
      throw networkError(e);
    }

    yield { delta: "", done: true };
  }
}
