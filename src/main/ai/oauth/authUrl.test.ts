import { describe, it, expect } from "vitest";
import type { OAuthConfig } from "./configs.js";
import { buildAuthUrl } from "./authUrl.js";

// A fake config with all required fields set.
const fakeConfig: OAuthConfig = {
  authUrl: "https://auth.example.com/oauth/authorize",
  tokenUrl: "https://auth.example.com/oauth/token",
  scopes: ["openid", "profile", "email"],
  clientId: "cid",
  clientSecret: undefined,
};

const fakeParams = {
  redirectUri: "http://localhost:9000/callback",
  state: "random-state-xyz",
  codeChallenge: "abc123challenge",
};

describe("buildAuthUrl", () => {
  it("returns a URL with the correct origin and path", () => {
    const result = buildAuthUrl(fakeConfig, fakeParams);
    const parsed = new URL(result);
    expect(parsed.origin).toBe("https://auth.example.com");
    expect(parsed.pathname).toBe("/oauth/authorize");
  });

  it("sets client_id to the config clientId", () => {
    const parsed = new URL(buildAuthUrl(fakeConfig, fakeParams));
    expect(parsed.searchParams.get("client_id")).toBe("cid");
  });

  it("sets response_type=code", () => {
    const parsed = new URL(buildAuthUrl(fakeConfig, fakeParams));
    expect(parsed.searchParams.get("response_type")).toBe("code");
  });

  it("sets code_challenge_method=S256", () => {
    const parsed = new URL(buildAuthUrl(fakeConfig, fakeParams));
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("sets scope as space-joined scopes", () => {
    const parsed = new URL(buildAuthUrl(fakeConfig, fakeParams));
    expect(parsed.searchParams.get("scope")).toBe("openid profile email");
  });

  it("sets redirect_uri correctly (URL-encoded by URLSearchParams)", () => {
    const parsed = new URL(buildAuthUrl(fakeConfig, fakeParams));
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:9000/callback"
    );
  });

  it("sets state correctly", () => {
    const parsed = new URL(buildAuthUrl(fakeConfig, fakeParams));
    expect(parsed.searchParams.get("state")).toBe("random-state-xyz");
  });

  it("sets code_challenge correctly", () => {
    const parsed = new URL(buildAuthUrl(fakeConfig, fakeParams));
    expect(parsed.searchParams.get("code_challenge")).toBe("abc123challenge");
  });

  it("sets access_type=offline", () => {
    const parsed = new URL(buildAuthUrl(fakeConfig, fakeParams));
    expect(parsed.searchParams.get("access_type")).toBe("offline");
  });

  it("sets prompt=consent", () => {
    const parsed = new URL(buildAuthUrl(fakeConfig, fakeParams));
    expect(parsed.searchParams.get("prompt")).toBe("consent");
  });

  it("URL-encodes special characters in redirect_uri via searchParams", () => {
    const paramsWithSpecial = {
      ...fakeParams,
      redirectUri: "http://localhost:9000/callback?foo=bar&baz=qux",
    };
    const result = buildAuthUrl(fakeConfig, paramsWithSpecial);
    const parsed = new URL(result);
    // searchParams.get decodes, so we get back the original value
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:9000/callback?foo=bar&baz=qux"
    );
    // And in the raw query string it should be percent-encoded
    expect(result).toContain("redirect_uri=");
    expect(result).not.toContain("redirect_uri=http://localhost");
  });

  it("URL-encodes special characters in state via searchParams", () => {
    const paramsWithSpecialState = {
      ...fakeParams,
      state: "state with spaces & special=chars",
    };
    const result = buildAuthUrl(fakeConfig, paramsWithSpecialState);
    const parsed = new URL(result);
    expect(parsed.searchParams.get("state")).toBe(
      "state with spaces & special=chars"
    );
  });

  it("throws when clientId is undefined", () => {
    const cfgNoId: OAuthConfig = {
      ...fakeConfig,
      clientId: undefined,
    };
    expect(() => buildAuthUrl(cfgNoId, fakeParams)).toThrow(
      "OAuth client id not configured"
    );
  });
});
