// OAuth runner (Phase 9b, PR 2/2). Main-process only — drives the PKCE +
// loopback-redirect Authorization Code flow for the providers that support it
// (Anthropic, OpenAI, Google), exchanges the code for tokens, stores them
// encrypted via the shared credential store, and refreshes them on demand.
//
// SECURITY: the system browser does the actual sign-in; we only run a
// short-lived 127.0.0.1 loopback server to catch the redirect `code`, validate
// the `state` nonce (CSRF guard), and immediately exchange it. Tokens never
// touch the renderer — only AuthStatus does.
//
// CONFIGURABILITY: per-provider client id/secret come from env vars (see
// configs.ts). With none set, startOAuth() rejects with a clear "set
// AIMAP_OAUTH_<ID>_CLIENT_ID" message, so the flow is fully real yet bundles no
// private credentials. Endpoints are baked best-effort defaults.

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { shell } from "electron";
import { generatePkce, randomState } from "./pkce.js";
import { buildAuthUrl } from "./authUrl.js";
import { clientIdEnvVar, oauthConfig, type OAuthConfig } from "./configs.js";
import { ProviderError, kindForStatus } from "../providers/error.js";
import { getCredential, setOAuth } from "../credentials.js";
import type { ProviderId } from "../types.js";

/** How long we wait for the user to complete the browser sign-in. */
const CALLBACK_TIMEOUT_MS = 5 * 60_000;
/** Refresh when the access token has under this long left (or is expired). */
const REFRESH_SKEW_MS = 60_000;

interface TokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/** Parse a token-endpoint JSON response into our stored bundle. */
function parseTokens(json: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}): TokenBundle {
  if (!json.access_token) {
    throw new ProviderError("auth", "Token response did not include an access_token.");
  }
  return {
    accessToken: json.access_token,
    ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}),
    ...(json.expires_in ? { expiresAt: Date.now() + json.expires_in * 1000 } : {}),
  };
}

/** POST the token endpoint (form-encoded) and parse the bundle. */
async function postToken(
  cfg: OAuthConfig,
  params: Record<string, string>,
): Promise<TokenBundle> {
  const body = new URLSearchParams(params);
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  let res: Response;
  try {
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
  } catch (e) {
    throw new ProviderError("network", `Token request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ProviderError(
      kindForStatus(res.status),
      `Token request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  return parseTokens((await res.json()) as Parameters<typeof parseTokens>[0]);
}

/**
 * Run the full OAuth Authorization Code + PKCE flow for `id` and store the
 * resulting tokens. Throws a classified ProviderError on any failure.
 */
export async function startOAuth(id: ProviderId): Promise<void> {
  const cfg = oauthConfig(id);
  if (!cfg) throw new ProviderError("invalid_request", `${id} does not support OAuth sign-in.`);
  if (!cfg.clientId) {
    throw new ProviderError(
      "invalid_request",
      `OAuth client not configured. Set ${clientIdEnvVar(id)} to enable ${id} OAuth sign-in.`,
    );
  }

  const pkce = generatePkce();
  const state = randomState();

  // Spin a one-shot loopback server to catch the redirect, then exchange.
  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
    (resolve, reject) => {
      let redirectUri = "";
      let settled = false;
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (!url.pathname.startsWith("/callback")) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<!doctype html><meta charset=utf-8><body style='font-family:system-ui;padding:2rem'>" +
            "<h2>Signed in.</h2><p>You can close this tab and return to AI-Mindmap.</p>",
        );
        const err = url.searchParams.get("error");
        const returnedState = url.searchParams.get("state");
        const codeParam = url.searchParams.get("code");
        finish();
        if (err) return reject(new ProviderError("auth", `Sign-in was denied (${err}).`));
        if (returnedState !== state)
          return reject(new ProviderError("auth", "OAuth state mismatch — sign-in aborted."));
        if (!codeParam) return reject(new ProviderError("auth", "OAuth callback had no authorization code."));
        resolve({ code: codeParam, redirectUri });
      });

      const timer = setTimeout(() => {
        finish();
        reject(new ProviderError("network", "OAuth timed out waiting for sign-in."));
      }, CALLBACK_TIMEOUT_MS);

      function finish(): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        server.close();
      }

      server.on("error", (e) => {
        finish();
        reject(new ProviderError("network", `OAuth loopback server failed: ${e.message}`));
      });

      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        redirectUri = `http://127.0.0.1:${port}/callback`;
        const authUrl = buildAuthUrl(cfg, {
          redirectUri,
          state,
          codeChallenge: pkce.challenge,
        });
        void shell.openExternal(authUrl);
      });
    },
  );

  const tokens = await postToken(cfg, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
    code_verifier: pkce.verifier,
  });
  await setOAuth(id, tokens);
}

/**
 * If `id` is OAuth-authed and its access token is expired (or within the skew
 * window) and a refresh token exists, refresh it in place. Best-effort: on any
 * failure it leaves the existing token so the subsequent API call surfaces a
 * clean auth error. A no-op for API-key credentials.
 */
export async function maybeRefresh(id: ProviderId): Promise<void> {
  const cred = await getCredential(id);
  if (!cred || cred.type !== "oauth" || !cred.refreshToken || !cred.expiresAt) return;
  if (Date.now() < cred.expiresAt - REFRESH_SKEW_MS) return;
  const cfg = oauthConfig(id);
  if (!cfg || !cfg.clientId) return;
  try {
    const next = await postToken(cfg, {
      grant_type: "refresh_token",
      refresh_token: cred.refreshToken,
      client_id: cfg.clientId,
    });
    await setOAuth(id, {
      accessToken: next.accessToken,
      // Some providers don't re-issue a refresh token on refresh — keep the old.
      refreshToken: next.refreshToken ?? cred.refreshToken,
      ...(next.expiresAt ? { expiresAt: next.expiresAt } : {}),
    });
  } catch {
    /* leave the stale token; the API call will report auth failure */
  }
}
