// Multi-provider AI types (Phase 9b — multi-provider auth). Main-process side.
//
// The app supports five AI providers, each usable via an API key (and, for the
// three that offer it, OAuth — added in a follow-up PR). These types are the
// main-process contract; src/shared/platform.ts mirrors the renderer-facing
// subset at the IPC boundary (main is CommonJS and can't import the ESM shared
// module, so the string-compatible ProviderId union is duplicated there).

/** The five supported providers. Stable string ids — used as storage keys. */
export type ProviderId = "anthropic" | "openai" | "google" | "minimax" | "kimi";

export const PROVIDER_IDS: readonly ProviderId[] = [
  "anthropic",
  "openai",
  "google",
  "minimax",
  "kimi",
];

/** Static, user-facing description of a provider (shown in Settings). */
export interface ProviderMeta {
  id: ProviderId;
  /** Display name, e.g. "Claude (Anthropic)". */
  label: string;
  /** Whether OAuth sign-in is offered (added in the OAuth follow-up PR). */
  supportsOAuth: boolean;
  /** Default model id used when a request omits `model`. */
  defaultModel: string;
  /** Placeholder shown in the API-key input (hints the key's shape). */
  keyPlaceholder: string;
  /** Where the user gets an API key (shown as a hint link in Settings). */
  keyUrl: string;
}

/**
 * What we persist per provider, encrypted at rest via Electron safeStorage.
 * Either a raw API key, or an OAuth token bundle (OAuth lands in a follow-up
 * PR; the shape is defined now so the credential store is stable).
 */
export type StoredCredential =
  | { type: "apiKey"; key: string }
  | {
      type: "oauth";
      accessToken: string;
      refreshToken?: string;
      /** Epoch ms when the access token expires (for refresh). */
      expiresAt?: number;
    };

/** Auth state for one provider, safe to send to the renderer (no secrets). */
export interface AuthStatus {
  configured: boolean;
  method: "apiKey" | "oauth" | null;
}

/**
 * Provider catalog. `defaultModel`s are the current flagship per provider.
 * `supportsOAuth` is true only for the three with a usable third-party OAuth
 * flow (Anthropic, OpenAI/Codex, Google); MiniMax and Kimi are API-key only.
 */
export const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    supportsOAuth: true,
    defaultModel: "claude-opus-4-7",
    keyPlaceholder: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI (Codex)",
    supportsOAuth: true,
    defaultModel: "gpt-4o",
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    supportsOAuth: true,
    defaultModel: "gemini-2.0-flash",
    keyPlaceholder: "AIza…",
    keyUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "minimax",
    label: "MiniMax",
    supportsOAuth: false,
    defaultModel: "MiniMax-Text-01",
    keyPlaceholder: "eyJ… (JWT)",
    keyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    supportsOAuth: false,
    defaultModel: "kimi-k2-0711-preview",
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
  },
];

export function providerMeta(id: ProviderId): ProviderMeta {
  const m = PROVIDERS.find((p) => p.id === id);
  if (!m) throw new Error(`Unknown provider: ${id}`);
  return m;
}

export function isProviderId(x: unknown): x is ProviderId {
  return typeof x === "string" && PROVIDER_IDS.includes(x as ProviderId);
}
