// OAuth provider configurations for AI-Mindmap.
//
// Best-effort defaults: endpoint URLs and scopes are baked in based on each
// provider's current OAuth docs as of implementation; they may need updating
// as providers evolve their auth flows. Client ids / secrets come from env
// vars so no private values are hardcoded.

import type { ProviderId } from "../types.js";

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Client id from env var AIMAP_OAUTH_<ID>_CLIENT_ID. undefined when unset. */
  clientId: string | undefined;
  /** Client secret from env var AIMAP_OAUTH_<ID>_CLIENT_SECRET. undefined for PKCE public clients or when unset. */
  clientSecret: string | undefined;
}

/** Returns the env var name that supplies a provider's OAuth client id. */
export function clientIdEnvVar(id: ProviderId): string {
  return `AIMAP_OAUTH_${id.toUpperCase()}_CLIENT_ID`;
}

/** Returns the env var name that supplies a provider's OAuth client secret. */
function clientSecretEnvVar(id: ProviderId): string {
  return `AIMAP_OAUTH_${id.toUpperCase()}_CLIENT_SECRET`;
}

/**
 * OAuth config for a provider, or null if the provider has no OAuth support.
 * Client credentials are read live from process.env on each call.
 */
export function oauthConfig(id: ProviderId): OAuthConfig | null {
  switch (id) {
    case "anthropic":
      return {
        // https://docs.anthropic.com/en/docs/claude-code/oauth
        authUrl: "https://claude.ai/oauth/authorize",
        tokenUrl: "https://console.anthropic.com/v1/oauth/token",
        scopes: ["org:create_api_key", "user:profile", "user:inference"],
        clientId: process.env[clientIdEnvVar("anthropic")],
        clientSecret: process.env[clientSecretEnvVar("anthropic")],
      };

    case "openai":
      return {
        // https://platform.openai.com/docs/guides/oauth
        authUrl: "https://auth.openai.com/oauth/authorize",
        tokenUrl: "https://auth.openai.com/oauth/token",
        scopes: ["openid", "profile", "email", "offline_access"],
        clientId: process.env[clientIdEnvVar("openai")],
        clientSecret: process.env[clientSecretEnvVar("openai")],
      };

    case "google":
      return {
        // https://developers.google.com/identity/protocols/oauth2
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: [
          "https://www.googleapis.com/auth/generative-language.retriever",
        ],
        clientId: process.env[clientIdEnvVar("google")],
        clientSecret: process.env[clientSecretEnvVar("google")],
      };

    case "minimax":
    case "kimi":
      // API-key only providers — no OAuth flow.
      return null;

    default: {
      // Exhaustiveness guard — TypeScript should catch this at compile time.
      const _exhaustive: never = id;
      void _exhaustive;
      return null;
    }
  }
}
