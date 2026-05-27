import { describe, it, expect } from "vitest";
import * as crypto from "node:crypto";
import { base64url, generatePkce, randomState } from "./pkce";

// Helper: reverse base64url to a Buffer for round-trip testing.
function decodeBase64url(str: string): Buffer {
  // Re-pad to a multiple of 4 chars, swap - -> +, _ -> /
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const withPad = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return Buffer.from(withPad, "base64");
}

describe("base64url", () => {
  it("produces no +, /, or = characters", () => {
    // Test with many random buffers to cover all byte patterns
    for (let i = 0; i < 20; i++) {
      const buf = crypto.randomBytes(32 + i);
      const encoded = base64url(buf);
      expect(encoded).not.toMatch(/[+/=]/);
    }
  });

  it("round-trips back to the original bytes", () => {
    for (let i = 0; i < 20; i++) {
      const original = crypto.randomBytes(32 + i);
      const encoded = base64url(original);
      const decoded = decodeBase64url(encoded);
      expect(decoded.equals(original)).toBe(true);
    }
  });

  it("uses only unreserved URL-safe characters (A-Za-z0-9_-)", () => {
    for (let i = 0; i < 20; i++) {
      const encoded = base64url(crypto.randomBytes(32 + i));
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("generatePkce", () => {
  it("verifier length is in [43, 128]", () => {
    const { verifier } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("verifier matches unreserved charset /^[A-Za-z0-9_-]+$/", () => {
    const { verifier } = generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('method is "S256"', () => {
    const { method } = generatePkce();
    expect(method).toBe("S256");
  });

  it("challenge equals independently recomputed base64url(sha256(verifier))", () => {
    const { verifier, challenge } = generatePkce();
    const expected = base64url(
      crypto.createHash("sha256").update(verifier).digest() as Buffer
    );
    expect(challenge).toBe(expected);
  });

  it("two calls produce different verifiers (randomness)", () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("two calls produce different challenges (derived from different verifiers)", () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe("randomState", () => {
  it("two calls return different values", () => {
    const a = randomState();
    const b = randomState();
    expect(a).not.toBe(b);
  });

  it("matches unreserved URL-safe charset /^[A-Za-z0-9_-]+$/", () => {
    for (let i = 0; i < 10; i++) {
      const state = randomState();
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("has sufficient entropy (decoded length >= 32 bytes)", () => {
    const state = randomState();
    const decoded = decodeBase64url(state);
    expect(decoded.length).toBeGreaterThanOrEqual(32);
  });

  it("contains no +, /, or = characters", () => {
    for (let i = 0; i < 10; i++) {
      expect(randomState()).not.toMatch(/[+/=]/);
    }
  });
});
