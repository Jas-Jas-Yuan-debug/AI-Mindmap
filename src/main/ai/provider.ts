// AIProvider abstraction (Phase 9). Lives in the Electron main process — the
// renderer never holds the API key or talks to Anthropic directly; it goes
// through the ai:* IPC channels (see src/main/ipc/ai.ts).
//
// Main is CommonJS and can't import src/shared (ESM), so the request/response
// shapes are defined locally here. They mirror the AIRequest/AIResponse/AIChunk
// types in src/shared/platform.ts at the IPC boundary.

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequest {
  model?: string;
  system?: string;
  messages: AIMessage[];
  maxTokens?: number;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface AIResponse {
  text: string;
  usage?: AIUsage;
}

export interface AIChunk {
  delta: string;
  done: boolean;
}

/** What the renderer gets when a call fails — friendly, classified, no stack. */
export interface AIError {
  /** Coarse classification for UI handling. */
  kind: "no_key" | "auth" | "rate_limit" | "overloaded" | "network" | "invalid_request" | "unknown";
  message: string;
}

export interface AIProvider {
  readonly name: string;
  /** One-shot completion. */
  complete(req: AIRequest): Promise<AIResponse>;
  /** Streamed completion. Yields text deltas, then a final {done:true} chunk. */
  stream(req: AIRequest): AsyncIterable<AIChunk>;
  /** Whether the provider is usable (has a key, etc.). */
  hasKey(): Promise<boolean>;
}

/** Default model for AI features. Opus 4.7 — see claude-api skill / plan §3. */
export const DEFAULT_MODEL = "claude-opus-4-7";
/** Streaming default; large so long generations aren't truncated mid-thought. */
export const DEFAULT_MAX_TOKENS = 8192;
