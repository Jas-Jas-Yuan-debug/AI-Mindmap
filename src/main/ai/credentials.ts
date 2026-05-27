// Per-provider credential storage in the Electron main process, encrypted at
// rest via `safeStorage` (OS-backed: Keychain / DPAPI / libsecret). Generalizes
// the original single-key keyStore (Phase 9) to the five-provider model.
//
// SECURITY: credentials NEVER leave the main process. The renderer can ask
// "what's the auth status" (a boolean + method, no secret) and "set this
// key / clear this provider", but there is no channel that returns a stored
// secret. Each provider's secret is encrypted into its own file:
//   <userData>/ai-cred-<provider>.enc   (encrypted JSON StoredCredential)
//
// Back-compat: the Phase-9 build stored the Anthropic key as a raw encrypted
// string in `<userData>/anthropic-key.enc`. We still read that as the anthropic
// apiKey when no new-format file exists, and migrate it forward on first write.

import { app, safeStorage } from "electron";
import { readFile, writeFile, rm, mkdir } from "fs/promises";
import * as path from "path";
import type { AuthStatus, ProviderId, StoredCredential } from "./types.js";

function dir(): string {
  return app.getPath("userData");
}

function credPath(id: ProviderId): string {
  return path.join(dir(), `ai-cred-${id}.enc`);
}

/** Legacy single-key file from Phase 9 (anthropic only). */
function legacyAnthropicPath(): string {
  return path.join(dir(), "anthropic-key.enc");
}

function activeProviderPath(): string {
  return path.join(dir(), "ai-active-provider.json");
}

function assertEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "OS secure storage is unavailable; cannot store the credential safely.",
    );
  }
}

async function writeEncrypted(file: string, plaintext: string): Promise<void> {
  assertEncryption();
  const enc = safeStorage.encryptString(plaintext);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, enc);
}

async function readEncrypted(file: string): Promise<string | null> {
  try {
    const enc = await readFile(file);
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(enc);
  } catch {
    return null;
  }
}

/**
 * Read a provider's stored credential (decrypted) for use INSIDE the main
 * process only. Returns null when nothing is configured. Never IPC this out.
 */
export async function getCredential(
  id: ProviderId,
): Promise<StoredCredential | null> {
  const raw = await readEncrypted(credPath(id));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredCredential;
      if (parsed && (parsed.type === "apiKey" || parsed.type === "oauth")) {
        return parsed;
      }
    } catch {
      /* fall through to legacy */
    }
  }
  // Legacy fallback: the old Anthropic-only raw-key file.
  if (id === "anthropic") {
    const legacy = await readEncrypted(legacyAnthropicPath());
    if (legacy && legacy.trim()) return { type: "apiKey", key: legacy.trim() };
  }
  return null;
}

/** Store (or, with an empty string, clear) a provider's API key. */
export async function setApiKey(id: ProviderId, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await clearCredential(id);
    return;
  }
  const cred: StoredCredential = { type: "apiKey", key: trimmed };
  await writeEncrypted(credPath(id), JSON.stringify(cred));
  // Migrate away from the legacy file once the new one exists.
  if (id === "anthropic") await rm(legacyAnthropicPath(), { force: true });
}

/** Store an OAuth token bundle for a provider (used by the OAuth flow). */
export async function setOAuth(
  id: ProviderId,
  tokens: Omit<Extract<StoredCredential, { type: "oauth" }>, "type">,
): Promise<void> {
  const cred: StoredCredential = { type: "oauth", ...tokens };
  await writeEncrypted(credPath(id), JSON.stringify(cred));
}

/** Remove all stored credentials for a provider (sign out). */
export async function clearCredential(id: ProviderId): Promise<void> {
  await rm(credPath(id), { force: true });
  if (id === "anthropic") await rm(legacyAnthropicPath(), { force: true });
}

/** Auth status for one provider — safe to send to the renderer (no secret). */
export async function authStatus(id: ProviderId): Promise<AuthStatus> {
  const cred = await getCredential(id);
  if (!cred) return { configured: false, method: null };
  return { configured: true, method: cred.type === "oauth" ? "oauth" : "apiKey" };
}

import type { ProviderMeta } from "./types.js";
import { PROVIDER_IDS, isProviderId } from "./types.js";

/** Auth status for every provider, keyed by id. */
export async function allAuthStatus(): Promise<Record<ProviderId, AuthStatus>> {
  const entries = await Promise.all(
    PROVIDER_IDS.map(async (id) => [id, await authStatus(id)] as const),
  );
  return Object.fromEntries(entries) as Record<ProviderId, AuthStatus>;
}

// --- Active provider (which provider chat/features use) --------------------
// Not a secret — a small plaintext JSON in userData. Defaults to "anthropic".

export async function getActiveProvider(): Promise<ProviderId> {
  try {
    const raw = await readFile(activeProviderPath(), "utf8");
    const parsed = JSON.parse(raw) as { active?: unknown };
    if (isProviderId(parsed.active)) return parsed.active;
  } catch {
    /* default below */
  }
  return "anthropic";
}

export async function setActiveProvider(id: ProviderId): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await writeFile(activeProviderPath(), JSON.stringify({ active: id }), "utf8");
}

// Re-export the catalog accessor for handlers that need to send it on.
export type { ProviderMeta };
