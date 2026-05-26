// Pure helper + thin side-effecting wrapper for opening a LinkNode's URL in the
// OS browser. Extracted from LinkNode.tsx so the normalization logic is unit
// testable and so the Konva renderer AND the window-level dblclick overlay
// (LinkOverlayLayer.tsx) share ONE code path.
//
// Why this exists (root cause of the "double-click does nothing" bug):
//   - LinkNode's open affordance used to live solely on the Konva Group's
//     `onDblClick`. A Konva Group with `draggable` only fires `dblclick` when
//     two clicks land on the same shape with NO drag in between; the tiny
//     pointer movement that happens during a real double-click frequently
//     registers as a (zero-distance) drag and resets Konva's click pairing, so
//     the dblclick never fires. Text nodes never hit this because their
//     dblclick-to-edit runs off a window-level DOM listener (NodeOverlayLayer),
//     not Konva's onDblClick. Link/file nodes were the only kinds relying on
//     the flaky Konva path. We move link-open onto the same reliable
//     window-level DOM mechanism and keep the Konva handler as a fallback.
//   - Electron's `shell:openExternal` IPC only opens URLs whose `new URL()`
//     parses to http(s). A node URL of `baidu.com` (no scheme) throws and was
//     silently dropped. `normalizeOpenableUrl` adds a default `https://` so a
//     scheme-less host still opens.

/**
 * Normalize a user/imported URL into an http(s) URL string suitable for
 * `shell.openExternal`, or return `null` if it can't be made into a safe
 * web URL.
 *
 * Rules:
 *   - Trim surrounding whitespace.
 *   - `http:` / `https:` URLs pass through (re-serialized via the URL parser).
 *   - A scheme-less host like `baidu.com` or `www.example.com/path` gets a
 *     default `https://` prefix, then must parse as http(s).
 *   - Anything else (empty, other schemes like `javascript:` / `file:` /
 *     `mailto:`, or unparseable) returns `null` — we never hand a non-web
 *     scheme to the shell.
 */
export function normalizeOpenableUrl(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const tryParse = (candidate: string): string | null => {
    try {
      const u = new URL(candidate);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return u.toString();
      }
      return null;
    } catch {
      return null;
    }
  };

  // Already has a scheme (e.g. https://, http://, but also javascript:,
  // mailto:, file:). Parse as-is; non-http(s) schemes are rejected by tryParse.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return tryParse(trimmed);
  }

  // No scheme → assume https. Reject if it still doesn't parse as a host.
  return tryParse(`https://${trimmed}`);
}

/**
 * Open a LinkNode URL in the OS browser. Web → `window.open` (Electron preload
 * also routes through `shell.openExternal`). No-op when the URL can't be
 * normalized to http(s) or when no platform adapter is present (SSR / tests).
 *
 * Returns `true` when an open was attempted, `false` when the URL was rejected
 * — handy for callers (and tests) that want to know whether the gesture did
 * anything.
 */
export function openLinkUrl(raw: string): boolean {
  const url = normalizeOpenableUrl(raw);
  if (!url) return false;
  if (typeof window === "undefined") return false;
  void window.platform?.shell.openExternal(url);
  return true;
}
