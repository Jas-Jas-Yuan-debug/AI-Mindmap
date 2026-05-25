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

export interface AIRequest {
  model: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
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
    hasKey(): Promise<boolean>;
    setKey(key: string): Promise<void>;
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
