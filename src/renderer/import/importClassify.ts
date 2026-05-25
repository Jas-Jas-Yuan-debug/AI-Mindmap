// Pure classification helpers for Phase 7 embeds (image / file / link nodes).
//
// Kept free of React / Konva / DOM so the decision logic is unit-testable in
// the node test env. The hooks that own the actual drop / paste events
// (`useDropImport`, `usePasteImport`) call into these to decide what kind of
// node to create.

/** Default on-canvas sizes for each embed node type (canvas px). */
export const IMAGE_DEFAULT_MAX = 320; // longest side when we can't read intrinsic size
export const FILE_NODE_SIZE = { width: 200, height: 72 } as const;
export const LINK_NODE_SIZE = { width: 280, height: 96 } as const;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

/**
 * Decide whether a dropped/pasted file should become an ImageNode or a
 * generic FileNode. Uses the MIME type first (most reliable), falling back to
 * the filename extension when the type is missing/empty (common for some
 * drag sources).
 */
export function classifyDropFile(file: {
  name: string;
  type: string;
}): "image" | "file" {
  if (file.type && file.type.startsWith("image/")) return "image";
  if (!file.type && IMAGE_EXT.test(file.name)) return "image";
  return "file";
}

/**
 * Is a pasted text payload a single URL we should turn into a LinkNode?
 * Accepts http(s) URLs only (no javascript:, data:, file: — those are either
 * unsafe or not "links" in the product sense). Trims surrounding whitespace
 * and rejects multi-line / multi-token payloads (those are plain text, which
 * the caller routes to a TextNode instead).
 */
export function isPasteableUrl(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false; // empty or multi-token
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Fit an intrinsic image size into a bounding box (longest side =
 * IMAGE_DEFAULT_MAX) while preserving aspect ratio. Used to size a freshly
 * dropped image so a huge photo doesn't fill the whole canvas.
 */
export function fitImageSize(
  naturalWidth: number,
  naturalHeight: number,
  max = IMAGE_DEFAULT_MAX,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: max, height: max };
  }
  const longest = Math.max(naturalWidth, naturalHeight);
  if (longest <= max) {
    return { width: Math.round(naturalWidth), height: Math.round(naturalHeight) };
  }
  const scale = max / longest;
  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  };
}

/** Derive a short display name from a URL's host (for the LinkNode title fallback). */
export function urlDisplayName(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
