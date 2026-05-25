// Main-process IPC handlers for Phase 7 embeds:
//   shell:openPath      → open a file/folder in the OS default app
//   shell:openExternal  → open a URL in the OS browser
//   links:fetchMeta     → fetch a page's <title> + favicon (5s timeout)
//
// Channel names mirror the renderer/preload string literals (this CommonJS
// main bundle can't import src/shared, which is ESM + excluded from
// tsconfig.main.json).

import { ipcMain, shell } from "electron";

interface LinkMeta {
  title?: string;
  favicon?: string;
}

const FETCH_TIMEOUT_MS = 5000;

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m || !m[1]) return undefined;
  return m[1].trim().replace(/\s+/g, " ").slice(0, 300) || undefined;
}

function extractFavicon(html: string, pageUrl: string): string | undefined {
  // Look for <link rel="icon|shortcut icon|apple-touch-icon" href="...">
  const linkRe = /<link[^>]+rel=["']([^"']*icon[^"']*)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const tag = match[0];
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) {
      try {
        return new URL(href, pageUrl).toString();
      } catch {
        // ignore malformed href
      }
    }
  }
  // Fallback to /favicon.ico at the origin.
  try {
    return new URL("/favicon.ico", pageUrl).toString();
  } catch {
    return undefined;
  }
}

async function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  // Only http(s) — the renderer already filters, but defend in main too.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AI-Mindmap/0.1 (+link-preview)" },
    });
    if (!res.ok) return { favicon: extractFavicon("", url) };
    const html = await res.text();
    return { title: extractTitle(html), favicon: extractFavicon(html, url) };
  } catch {
    // Network error / timeout / abort → no metadata (renderer keeps host title).
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function registerEmbedHandlers(): void {
  ipcMain.handle("shell:openPath", async (_e, p: string) => {
    if (typeof p === "string" && p.length > 0) await shell.openPath(p);
  });
  ipcMain.handle("shell:openExternal", async (_e, url: string) => {
    // Only open http(s)/file — never arbitrary schemes.
    if (typeof url !== "string") return;
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        await shell.openExternal(url);
      }
    } catch {
      // ignore malformed url
    }
  });
  ipcMain.handle("links:fetchMeta", async (_e, url: string) => {
    if (typeof url !== "string") return null;
    return fetchLinkMeta(url);
  });
}
