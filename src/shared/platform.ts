// The single contract between the React renderer and the host environment.
// Both src/platform/electron.ts and src/platform/web.ts implement this.
// The renderer accesses it via the global `platform` set in src/renderer/main.tsx.

export type PlatformKind = "electron" | "web";

export interface FileHandle {
  // Opaque, platform-specific. Renderer treats as a token to pass back into save().
  readonly _tag: "FileHandle";
  readonly displayName: string;
}

export interface RecentFile {
  displayName: string;
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

export interface Settings {
  theme: "light" | "dark" | "system";
  recentFiles: RecentFile[];
}

import type { JSONCanvas } from "./jsoncanvas.js";

export interface Platform {
  readonly kind: PlatformKind;

  files: {
    openCanvas(): Promise<{ handle: FileHandle; data: JSONCanvas } | null>;
    saveCanvas(handle: FileHandle, data: JSONCanvas): Promise<void>;
    saveCanvasAs(
      data: JSONCanvas,
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
}

// Phase 0 stub. Throws so the call site is obvious during development.
export function notImplemented(method: string): never {
  throw new Error(`Platform method not implemented yet: ${method}`);
}
