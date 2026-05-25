// API-key storage in the Electron main process using `safeStorage` (OS-backed
// encryption: Keychain on macOS, DPAPI on Windows, libsecret on Linux). The
// key is encrypted at rest and NEVER sent to the renderer — the renderer only
// ever asks "is a key set?" and "set this key", never reads it back.
//
// Chosen over keytar (which the plan named) because safeStorage is built into
// Electron — no native module to compile, same OS-keychain backing.

import { app, safeStorage } from "electron";
import { readFile, writeFile, rm, mkdir } from "fs/promises";
import * as path from "path";

function keyFilePath(): string {
  return path.join(app.getPath("userData"), "anthropic-key.enc");
}

export async function hasKey(): Promise<boolean> {
  try {
    await readFile(keyFilePath());
    return true;
  } catch {
    return false;
  }
}

export async function setKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    // Empty → clear the stored key.
    await rm(keyFilePath(), { force: true });
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage is unavailable; cannot store the API key safely.");
  }
  const enc = safeStorage.encryptString(trimmed);
  await mkdir(path.dirname(keyFilePath()), { recursive: true });
  await writeFile(keyFilePath(), enc);
}

/** Decrypt the stored key for use INSIDE the main process only. Never IPC this out. */
export async function readKey(): Promise<string | null> {
  try {
    const enc = await readFile(keyFilePath());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(enc);
  } catch {
    return null;
  }
}
