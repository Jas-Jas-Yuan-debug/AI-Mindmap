import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  PROVIDER_IDS,
  providerMeta,
  isProviderId,
} from "./types.js";

describe("PROVIDERS catalog", () => {
  it("has exactly 5 entries", () => {
    expect(PROVIDERS).toHaveLength(5);
  });

  it("provider ids match PROVIDER_IDS exactly (same order)", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual([...PROVIDER_IDS]);
  });

  it("has no duplicate ids", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("anthropic / openai / google support OAuth; minimax / kimi do not", () => {
    const oauthTrue = PROVIDERS.filter((p) => p.supportsOAuth).map((p) => p.id);
    const oauthFalse = PROVIDERS.filter((p) => !p.supportsOAuth).map(
      (p) => p.id,
    );
    expect(oauthTrue.sort()).toEqual(["anthropic", "google", "openai"].sort());
    expect(oauthFalse.sort()).toEqual(["kimi", "minimax"].sort());
  });

  it("every ProviderMeta has non-empty label, defaultModel, keyPlaceholder, keyUrl", () => {
    for (const p of PROVIDERS) {
      expect(p.label.trim(), `${p.id}.label`).not.toBe("");
      expect(p.defaultModel.trim(), `${p.id}.defaultModel`).not.toBe("");
      expect(p.keyPlaceholder.trim(), `${p.id}.keyPlaceholder`).not.toBe("");
      expect(p.keyUrl.trim(), `${p.id}.keyUrl`).not.toBe("");
    }
  });
});

describe("providerMeta()", () => {
  it("returns the correct entry for each known id", () => {
    for (const id of PROVIDER_IDS) {
      const meta = providerMeta(id);
      expect(meta.id).toBe(id);
    }
  });

  it("returns exactly the same object that is in PROVIDERS", () => {
    for (const id of PROVIDER_IDS) {
      expect(providerMeta(id)).toBe(PROVIDERS.find((p) => p.id === id));
    }
  });

  it("throws on an unknown provider id", () => {
    expect(() => providerMeta("unknown" as never)).toThrow();
  });
});

describe("isProviderId()", () => {
  it("returns true for every known id", () => {
    for (const id of PROVIDER_IDS) {
      expect(isProviderId(id), `expected true for "${id}"`).toBe(true);
    }
  });

  it("returns false for 'foo'", () => {
    expect(isProviderId("foo")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isProviderId(123)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isProviderId(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isProviderId(undefined)).toBe(false);
  });
});
