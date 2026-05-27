import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProviderId } from "../types.js";
import { oauthConfig, clientIdEnvVar } from "./configs.js";

describe("clientIdEnvVar", () => {
  it('returns "AIMAP_OAUTH_ANTHROPIC_CLIENT_ID" for anthropic', () => {
    expect(clientIdEnvVar("anthropic")).toBe("AIMAP_OAUTH_ANTHROPIC_CLIENT_ID");
  });

  it('returns "AIMAP_OAUTH_OPENAI_CLIENT_ID" for openai', () => {
    expect(clientIdEnvVar("openai")).toBe("AIMAP_OAUTH_OPENAI_CLIENT_ID");
  });

  it('returns "AIMAP_OAUTH_GOOGLE_CLIENT_ID" for google', () => {
    expect(clientIdEnvVar("google")).toBe("AIMAP_OAUTH_GOOGLE_CLIENT_ID");
  });

  it('returns "AIMAP_OAUTH_MINIMAX_CLIENT_ID" for minimax', () => {
    expect(clientIdEnvVar("minimax")).toBe("AIMAP_OAUTH_MINIMAX_CLIENT_ID");
  });

  it('returns "AIMAP_OAUTH_KIMI_CLIENT_ID" for kimi', () => {
    expect(clientIdEnvVar("kimi")).toBe("AIMAP_OAUTH_KIMI_CLIENT_ID");
  });
});

describe("oauthConfig — providers with OAuth support", () => {
  const oauthProviders: ProviderId[] = ["anthropic", "openai", "google"];

  const expectedAuthUrls: Record<string, string> = {
    anthropic: "https://claude.ai/oauth/authorize",
    openai: "https://auth.openai.com/oauth/authorize",
    google: "https://accounts.google.com/o/oauth2/v2/auth",
  };

  const expectedTokenUrls: Record<string, string> = {
    anthropic: "https://console.anthropic.com/v1/oauth/token",
    openai: "https://auth.openai.com/oauth/token",
    google: "https://oauth2.googleapis.com/token",
  };

  for (const id of oauthProviders) {
    describe(`provider: ${id}`, () => {
      let savedClientId: string | undefined;
      let savedClientSecret: string | undefined;

      beforeEach(() => {
        savedClientId = process.env[clientIdEnvVar(id)];
        savedClientSecret = process.env[`AIMAP_OAUTH_${id.toUpperCase()}_CLIENT_SECRET`];
        // Start each test with env vars unset
        delete process.env[clientIdEnvVar(id)];
        delete process.env[`AIMAP_OAUTH_${id.toUpperCase()}_CLIENT_SECRET`];
      });

      afterEach(() => {
        // Restore env vars
        if (savedClientId !== undefined) {
          process.env[clientIdEnvVar(id)] = savedClientId;
        } else {
          delete process.env[clientIdEnvVar(id)];
        }
        if (savedClientSecret !== undefined) {
          process.env[`AIMAP_OAUTH_${id.toUpperCase()}_CLIENT_SECRET`] = savedClientSecret;
        } else {
          delete process.env[`AIMAP_OAUTH_${id.toUpperCase()}_CLIENT_SECRET`];
        }
      });

      it("returns a non-null config", () => {
        expect(oauthConfig(id)).not.toBeNull();
      });

      it("has the expected authUrl", () => {
        const cfg = oauthConfig(id);
        expect(cfg?.authUrl).toBe(expectedAuthUrls[id]);
      });

      it("has the expected tokenUrl", () => {
        const cfg = oauthConfig(id);
        expect(cfg?.tokenUrl).toBe(expectedTokenUrls[id]);
      });

      it("has non-empty scopes array", () => {
        const cfg = oauthConfig(id);
        expect(cfg?.scopes.length).toBeGreaterThan(0);
      });

      it("clientId is undefined when env var is not set", () => {
        const cfg = oauthConfig(id);
        expect(cfg?.clientId).toBeUndefined();
      });

      it("clientId equals the env var value when set", () => {
        process.env[clientIdEnvVar(id)] = "test-client-id-123";
        const cfg = oauthConfig(id);
        expect(cfg?.clientId).toBe("test-client-id-123");
      });

      it("clientId is read live on each call (not cached)", () => {
        const cfgBefore = oauthConfig(id);
        expect(cfgBefore?.clientId).toBeUndefined();

        process.env[clientIdEnvVar(id)] = "live-value";
        const cfgAfter = oauthConfig(id);
        expect(cfgAfter?.clientId).toBe("live-value");
      });
    });
  }
});

describe("oauthConfig — anthropic scopes detail", () => {
  it("includes org:create_api_key, user:profile, user:inference", () => {
    const cfg = oauthConfig("anthropic");
    expect(cfg?.scopes).toContain("org:create_api_key");
    expect(cfg?.scopes).toContain("user:profile");
    expect(cfg?.scopes).toContain("user:inference");
  });
});

describe("oauthConfig — openai scopes detail", () => {
  it("includes openid, profile, email, offline_access", () => {
    const cfg = oauthConfig("openai");
    expect(cfg?.scopes).toContain("openid");
    expect(cfg?.scopes).toContain("profile");
    expect(cfg?.scopes).toContain("email");
    expect(cfg?.scopes).toContain("offline_access");
  });
});

describe("oauthConfig — google scopes detail", () => {
  it("includes the generative-language retriever scope", () => {
    const cfg = oauthConfig("google");
    expect(cfg?.scopes).toContain(
      "https://www.googleapis.com/auth/generative-language.retriever"
    );
  });
});

describe("oauthConfig — API-key-only providers", () => {
  it("returns null for minimax", () => {
    expect(oauthConfig("minimax")).toBeNull();
  });

  it("returns null for kimi", () => {
    expect(oauthConfig("kimi")).toBeNull();
  });
});
