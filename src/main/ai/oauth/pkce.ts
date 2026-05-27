import * as crypto from "node:crypto";

export interface Pkce {
  verifier: string;
  challenge: string;
  method: "S256";
}

/**
 * base64url-encode a Buffer (no padding, + -> -, / -> _).
 * Exported for testing/reuse.
 */
export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate a PKCE verifier (43–128 chars, base64url, unreserved) + its S256 challenge.
 * verifier is base64url(randomBytes(32)) which yields exactly 43 chars.
 * challenge is base64url(sha256(verifier)).
 */
export function generatePkce(): Pkce {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest() as Buffer
  );
  return { verifier, challenge, method: "S256" };
}

/**
 * A random URL-safe state nonce (base64url, >= 32 bytes of entropy).
 */
export function randomState(): string {
  return base64url(crypto.randomBytes(32));
}
