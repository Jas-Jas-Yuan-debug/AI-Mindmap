// Pure authorization-URL builder for PKCE OAuth flows.
// No Electron dependency — safe to unit-test in a plain Node environment.

import type { OAuthConfig } from "./configs.js";

export interface AuthUrlParams {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/**
 * Build the full authorization URL for a PKCE S256 / code response flow.
 *
 * Appends the following query parameters to cfg.authUrl:
 *   client_id, redirect_uri, response_type=code, scope (space-joined),
 *   state, code_challenge, code_challenge_method=S256,
 *   access_type=offline, prompt=consent
 *
 * The access_type and prompt parameters ensure providers that support them
 * (e.g. Google) return a refresh token alongside the initial access token.
 *
 * Throws if cfg.clientId is undefined (runner should guard before calling).
 */
export function buildAuthUrl(cfg: OAuthConfig, p: AuthUrlParams): string {
  if (cfg.clientId === undefined) {
    throw new Error("OAuth client id not configured");
  }

  const url = new URL(cfg.authUrl);

  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", p.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scopes.join(" "));
  url.searchParams.set("state", p.state);
  url.searchParams.set("code_challenge", p.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return url.toString();
}
