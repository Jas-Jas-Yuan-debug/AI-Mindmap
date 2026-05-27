// openaiCompatible.ts — base class for providers that speak the OpenAI
// /chat/completions REST API (OpenAI, MiniMax, Kimi all use this shape).
//
// Subclasses just supply a config object; this class handles:
//   - Bearer-token auth from the credential resolver
//   - complete() — one-shot JSON response
//   - stream() — SSE streaming via sseData()
//   - ProviderError mapping (HTTP status + network errors)

import type { AIChunk, AIProvider, AIRequest, AIResponse } from "../provider.js";
import { DEFAULT_MAX_TOKENS } from "../provider.js";
import type { CredentialResolver } from "./error.js";
import { kindForStatus, networkError, ProviderError } from "./error.js";
import { sseData } from "./sse.js";

export interface OpenAICompatConfig {
  /** Display name, used as `AIProvider.name`. */
  name: string;
  /** Base URL without trailing slash (e.g. "https://api.openai.com/v1"). */
  baseUrl: string;
  /** Default model id when AIRequest.model is absent. */
  defaultModel: string;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;

  constructor(
    private readonly resolve: CredentialResolver,
    private readonly cfg: OpenAICompatConfig,
  ) {
    this.name = cfg.name;
  }

  async hasKey(): Promise<boolean> {
    return (await this.resolve()) != null;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Resolve the credential and return the raw token string. */
  private async token(): Promise<string> {
    const cred = await this.resolve();
    if (!cred) {
      throw new ProviderError(
        "no_key",
        `${this.cfg.name} is not configured. Add a key in Settings.`,
      );
    }
    return cred.type === "apiKey" ? cred.key : cred.accessToken;
  }

  /**
   * Build the messages array, optionally prepending a system turn.
   * OpenAI-compatible APIs accept a role:"system" message at position 0.
   */
  private buildMessages(req: AIRequest): Array<{ role: string; content: string }> {
    const system: Array<{ role: string; content: string }> = req.system
      ? [{ role: "system", content: req.system }]
      : [];
    return system.concat(req.messages.map((m) => ({ role: m.role, content: m.content })));
  }

  /** Extract a friendly error message from a non-OK response body. */
  private async errorMessage(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as {
        error?: { message?: string };
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
    let res: Response;
    try {
      const tok = await this.token();
      res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({
          model: req.model ?? this.cfg.defaultModel,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: this.buildMessages(req),
        }),
      });
    } catch (e) {
      throw networkError(e);
    }

    if (!res.ok) {
      const msg = await this.errorMessage(res);
      throw new ProviderError(kindForStatus(res.status), msg);
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content?: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const text = json.choices[0]?.message.content ?? "";
    return {
      text,
      ...(json.usage
        ? {
            usage: {
              inputTokens: json.usage.prompt_tokens,
              outputTokens: json.usage.completion_tokens,
            },
          }
        : {}),
    };
  }

  async *stream(req: AIRequest): AsyncIterable<AIChunk> {
    let res: Response;
    try {
      const tok = await this.token();
      res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({
          model: req.model ?? this.cfg.defaultModel,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: this.buildMessages(req),
          stream: true,
        }),
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
        let chunk: { choices: Array<{ delta?: { content?: string } }> };
        try {
          chunk = JSON.parse(payload) as typeof chunk;
        } catch {
          continue; // skip malformed lines
        }
        const delta = chunk.choices[0]?.delta?.content;
        if (delta !== undefined) {
          yield { delta, done: false };
        }
      }
    } catch (e) {
      throw networkError(e);
    }

    yield { delta: "", done: true };
  }
}
