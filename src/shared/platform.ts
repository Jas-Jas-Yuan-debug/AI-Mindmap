// The single contract between the React renderer and the host environment.
// Both src/platform/electron.ts and src/platform/web.ts implement this.
// The renderer accesses it via the global `platform` set in src/renderer/main.tsx.

export type PlatformKind = "electron" | "web";

/**
 * Opaque handle to an open document. The renderer treats it as a token to
 * pass back into `saveCanvas`. Platform-specific internals:
 *   - Electron: `path` holds the absolute filesystem path.
 *   - Web: `id` correlates to a `FileSystemFileHandle` cached in the web
 *     platform adapter (the live handle can't be serialized, so we key it by
 *     id). `path` is undefined on web.
 */
export interface FileHandle {
  readonly _tag: "FileHandle";
  /** Human-readable name shown in the title bar / recent list, e.g. "notes.aimap". */
  readonly displayName: string;
  /** Absolute path on Electron; undefined on web. */
  readonly path?: string;
  /** Web-only correlation id for the cached FileSystemFileHandle. */
  readonly id?: string;
}

export interface RecentFile {
  displayName: string;
  /** Absolute path (Electron). Undefined on web (no stable path). */
  path?: string;
  lastOpenedAt: string;
}

/** The five supported AI providers. Mirrors src/main/ai/types.ts (main is CJS
 *  and can't import this ESM module, so the union is duplicated, kept in sync). */
export type ProviderId = "anthropic" | "openai" | "google" | "minimax" | "kimi";

/** User-facing provider description, sent from main for the Settings UI. */
export interface ProviderMeta {
  id: ProviderId;
  label: string;
  supportsOAuth: boolean;
  defaultModel: string;
  keyPlaceholder: string;
  keyUrl: string;
}

/** Auth state for one provider — never includes the secret itself. */
export interface AuthStatus {
  configured: boolean;
  method: "apiKey" | "oauth" | null;
}

export interface AIRequest {
  /** Optional — the main-process provider defaults to its own flagship model. */
  model?: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  /** Optional provider override; defaults to the persisted active provider. */
  providerId?: ProviderId;
}

export interface AIResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface AIChunk {
  delta: string;
  done: boolean;
}

/** Metadata fetched for a pasted link (Phase 7 LinkNode enrichment). */
export interface LinkMeta {
  /** Page <title>, when it could be read. */
  title?: string;
  /** Favicon as an absolute URL or data URL. */
  favicon?: string;
}

export interface Settings {
  theme: "light" | "dark" | "system";
  recentFiles: RecentFile[];
}

import type { AimapFile } from "./aimap.js";

export interface Platform {
  readonly kind: PlatformKind;

  files: {
    openCanvas(): Promise<{ handle: FileHandle; data: AimapFile } | null>;
    saveCanvas(handle: FileHandle, data: AimapFile): Promise<void>;
    saveCanvasAs(
      data: AimapFile,
      suggestedName?: string,
    ): Promise<FileHandle | null>;
    recentFiles(): Promise<RecentFile[]>;
  };

  ai: {
    complete(req: AIRequest): Promise<AIResponse>;
    stream(req: AIRequest): AsyncIterable<AIChunk>;
    /** Whether the ACTIVE provider is configured. */
    hasKey(): Promise<boolean>;
    listProviders(): Promise<ProviderMeta[]>;
    authStatus(): Promise<Record<ProviderId, AuthStatus>>;
    /** Set (empty string clears) a provider's API key. */
    setKey(provider: ProviderId, key: string): Promise<void>;
    /** Remove all credentials for a provider (sign out). */
    clearAuth(provider: ProviderId): Promise<void>;
    /** Run the OAuth sign-in flow for a provider (Anthropic / OpenAI / Google). */
    startOAuth(
      provider: ProviderId,
    ): Promise<{ ok: boolean; error?: { kind: string; message: string } }>;
    getActiveProvider(): Promise<ProviderId>;
    setActiveProvider(provider: ProviderId): Promise<void>;
  };

  settings: {
    get<K extends keyof Settings>(k: K): Promise<Settings[K]>;
    set<K extends keyof Settings>(k: K, v: Settings[K]): Promise<void>;
  };

  shell: {
    openPath(path: string): Promise<void>;
    openExternal(url: string): Promise<void>;
  };

  /** Link-preview metadata (Phase 7). Web returns null (no CORS-free fetch). */
  links: {
    fetchMeta(url: string): Promise<LinkMeta | null>;
  };
}

// Phase 0 stub. Throws so the call site is obvious during development.
export function notImplemented(method: string): never {
  throw new Error(`Platform method not implemented yet: ${method}`);
}
