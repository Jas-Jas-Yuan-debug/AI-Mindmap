import { describe, expect, it } from "vitest";
import { apiKeyWarning } from "./apiKeyFormat.js";

describe("apiKeyWarning — empty / whitespace → always null", () => {
  it("returns null for an empty string", () => {
    expect(apiKeyWarning("anthropic", "")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(apiKeyWarning("openai", "   ")).toBeNull();
  });

  it("returns null for a tab-only string", () => {
    expect(apiKeyWarning("google", "\t")).toBeNull();
  });
});

describe("apiKeyWarning — anthropic", () => {
  it("returns null for a plausible key (starts with sk-ant-)", () => {
    expect(apiKeyWarning("anthropic", "sk-ant-api03-abc123")).toBeNull();
  });

  it("returns a warning string for a key that does not start with sk-ant-", () => {
    const warning = apiKeyWarning("anthropic", "sk-wrongprefix-xxx");
    expect(warning).not.toBeNull();
    expect(typeof warning).toBe("string");
  });

  it("trims before checking (leading whitespace + correct prefix → null)", () => {
    expect(apiKeyWarning("anthropic", "  sk-ant-foobar")).toBeNull();
  });
});

describe("apiKeyWarning — openai", () => {
  it("returns null for a plausible key (starts with sk-)", () => {
    expect(apiKeyWarning("openai", "sk-proj-abc123")).toBeNull();
  });

  it("returns a warning for a key without sk- prefix", () => {
    const warning = apiKeyWarning("openai", "openai-key-abc");
    expect(warning).not.toBeNull();
  });
});

describe("apiKeyWarning — google", () => {
  it("returns null for a plausible key (starts with AIza)", () => {
    expect(apiKeyWarning("google", "AIzaSyAbcdefghij12345")).toBeNull();
  });

  it("returns a warning for a key without AIza prefix", () => {
    const warning = apiKeyWarning("google", "goog-abc-xyz");
    expect(warning).not.toBeNull();
  });
});

describe("apiKeyWarning — minimax", () => {
  it("returns null for a plausible JWT (starts with ey, has two dots)", () => {
    // Minimal JWT-shaped string: header.payload.signature
    expect(
      apiKeyWarning(
        "minimax",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      ),
    ).toBeNull();
  });

  it("returns a warning for a non-JWT string", () => {
    const warning = apiKeyWarning("minimax", "sk-some-api-key");
    expect(warning).not.toBeNull();
  });

  it("returns a warning for a string that starts with ey but has no dots", () => {
    const warning = apiKeyWarning("minimax", "eyNoDots");
    expect(warning).not.toBeNull();
  });

  it("returns a warning for a string that has dots but no ey prefix", () => {
    const warning = apiKeyWarning("minimax", "abc.def.ghi");
    expect(warning).not.toBeNull();
  });
});

describe("apiKeyWarning — kimi", () => {
  it("returns null for a plausible key (starts with sk-)", () => {
    expect(apiKeyWarning("kimi", "sk-moonshot-v1-abc123")).toBeNull();
  });

  it("returns a warning for a key without sk- prefix", () => {
    const warning = apiKeyWarning("kimi", "moonshot-api-key-xyz");
    expect(warning).not.toBeNull();
  });
});
