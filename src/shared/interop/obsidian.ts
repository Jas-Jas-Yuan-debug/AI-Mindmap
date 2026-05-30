// Converters between Obsidian Canvas (JSON Canvas 1.0, `.canvas`) and our
// `.mindmap` (AimapFile) format.
//
// JSON Canvas 1.0 spec: https://jsoncanvas.org/
//
// Lossy round-trip notes
// ─────────────────────
// • Canvas → mindmap: unknown/unsupported node types are silently dropped.
//   Missing ids are minted with makeId(); original ids are preserved when
//   present so the output stays stable across repeated imports.
//
// • mindmap → Canvas (best-effort):
//   - ShapeNode  → "text" node whose text is the shape's `.text` label (or "").
//     Canvas has no geometry primitives; a labeled text card is the closest
//     approximation. THIS IS LOSSY — shape kind and paint style are discarded.
//   - LinearNode / DrawNode → SKIPPED entirely. Canvas has no freeform lines or
//     freehand strokes. These node types are omitted from the export output.
//   - ImageNode  → "file" node using the ImageNode's `.file` path.
//   - All other V2 per-node style fields (strokeColor, strokeWidth, etc.) have
//     no Canvas equivalent and are dropped.

import type {
  AimapFile,
  Color,
  Edge,
  EdgeSide,
  Node,
} from "../aimap.js";
import { makeId } from "../aimap.js";

// ---------------------------------------------------------------------------
// Internal Canvas shapes (not exported — just for type-narrowing inside this
// module).
// ---------------------------------------------------------------------------

interface CanvasNodeBase {
  id?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  color?: unknown;
}

interface RawCanvasEdge {
  id?: unknown;
  fromNode?: unknown;
  fromSide?: unknown;
  toNode?: unknown;
  toSide?: unknown;
  color?: unknown;
  label?: unknown;
  fromEnd?: unknown;
  toEnd?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 80;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) ? v : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate and return a Color value (hex or preset "1".."6"). */
function parseColor(v: unknown): Color | undefined {
  if (typeof v !== "string") return undefined;
  if (/^#/.test(v)) return v as Color;
  if (/^[1-6]$/.test(v)) return v as Color;
  return undefined;
}

/** Validate a Canvas/aimap edge side string. */
function parseEdgeSide(v: unknown): EdgeSide | undefined {
  if (v === "top" || v === "right" || v === "bottom" || v === "left") return v;
  return undefined;
}

/** Extract the basename from a path, without extension. */
function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1] ?? filePath;
  const dotIdx = last.lastIndexOf(".");
  return dotIdx > 0 ? last.slice(0, dotIdx) : last;
}

/** Build a minimal valid AimapFile with empty nodes/edges. */
function emptyAimapFile(): AimapFile {
  const now = new Date().toISOString();
  return {
    formatVersion: 1,
    meta: {
      app: "AI-Mindmap",
      appVersion: "0.1.0",
      createdAt: now,
      updatedAt: now,
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

// ---------------------------------------------------------------------------
// Canvas → AimapFile
// ---------------------------------------------------------------------------

/** Convert a single raw Canvas node object → our Node (or null if unsupported). */
function convertCanvasNode(raw: CanvasNodeBase): Node | null {
  const id = asString(raw.id) ?? makeId("n");
  const x = asNumber(raw.x) ?? 0;
  const y = asNumber(raw.y) ?? 0;
  const width = asNumber(raw.width) ?? DEFAULT_WIDTH;
  const height = asNumber(raw.height) ?? DEFAULT_HEIGHT;
  const color = parseColor(raw.color);

  const base = {
    id,
    x,
    y,
    width,
    height,
    ...(color !== undefined ? { color } : {}),
  };

  const type = asString(raw.type);

  if (type === "text") {
    const rec = raw as Record<string, unknown>;
    return {
      ...base,
      type: "text",
      text: asString(rec["text"]) ?? "",
    };
  }

  if (type === "file") {
    const rec = raw as Record<string, unknown>;
    const file = asString(rec["file"]) ?? "";
    return {
      ...base,
      type: "file",
      file,
      ...(file ? { displayName: basename(file) } : {}),
    };
  }

  if (type === "link") {
    const rec = raw as Record<string, unknown>;
    return {
      ...base,
      type: "link",
      url: asString(rec["url"]) ?? "",
    };
  }

  if (type === "group") {
    const rec = raw as Record<string, unknown>;
    const label = asString(rec["label"]);
    return {
      ...base,
      type: "group",
      ...(label !== undefined ? { label } : {}),
    };
  }

  // Unknown / unsupported Canvas node type — skip.
  return null;
}

/** Convert a single raw Canvas edge object → our Edge (or null if malformed). */
function convertCanvasEdge(raw: RawCanvasEdge): Edge | null {
  const fromNode = asString(raw.fromNode);
  const toNode = asString(raw.toNode);
  if (!fromNode || !toNode) return null;

  const id = asString(raw.id) ?? makeId("e");
  const fromSide = parseEdgeSide(raw.fromSide);
  const toSide = parseEdgeSide(raw.toSide);
  const color = parseColor(raw.color);
  const label = asString(raw.label);

  return {
    id,
    fromNode,
    toNode,
    ...(fromSide !== undefined ? { fromSide } : {}),
    ...(toSide !== undefined ? { toSide } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(label !== undefined ? { label } : {}),
  };
}

/**
 * Convert a parsed Obsidian Canvas object → our AimapFile. Tolerant of
 * unknown / malformed input: always returns a valid document, never throws.
 */
export function obsidianToMindmap(raw: unknown): AimapFile {
  const file = emptyAimapFile();

  if (!isRecord(raw)) return file;

  const rawNodes = raw["nodes"];
  const rawEdges = raw["edges"];

  if (Array.isArray(rawNodes)) {
    for (const item of rawNodes) {
      if (!isRecord(item)) continue;
      const node = convertCanvasNode(item as CanvasNodeBase);
      if (node !== null) file.nodes.push(node);
    }
  }

  if (Array.isArray(rawEdges)) {
    for (const item of rawEdges) {
      if (!isRecord(item)) continue;
      const edge = convertCanvasEdge(item as RawCanvasEdge);
      if (edge !== null) file.edges.push(edge);
    }
  }

  return file;
}

// ---------------------------------------------------------------------------
// AimapFile → Canvas
// ---------------------------------------------------------------------------

interface CanvasNodeOut {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  // type-specific
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
  background?: string;
  backgroundStyle?: string;
}

interface CanvasEdgeOut {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  color?: string;
  label?: string;
  fromEnd?: string;
  toEnd?: string;
}

/** Emit the common positional + color fields for a canvas node. */
function nodeOutBase(
  n: Node,
): Pick<CanvasNodeOut, "id" | "x" | "y" | "width" | "height" | "color"> {
  return {
    id: n.id,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    ...(n.color !== undefined ? { color: n.color } : {}),
  };
}

/**
 * Convert our AimapFile → an Obsidian Canvas JSON object (best-effort).
 *
 * See module-level comment for lossy-conversion notes on ShapeNode,
 * LinearNode, and DrawNode.
 */
export function mindmapToObsidian(
  file: AimapFile,
): { nodes: unknown[]; edges: unknown[] } {
  const nodes: CanvasNodeOut[] = [];

  for (const n of file.nodes) {
    if (n.type === "text") {
      nodes.push({ ...nodeOutBase(n), type: "text", text: n.text });
      continue;
    }

    if (n.type === "file") {
      nodes.push({ ...nodeOutBase(n), type: "file", file: n.file });
      continue;
    }

    if (n.type === "link") {
      nodes.push({ ...nodeOutBase(n), type: "link", url: n.url });
      continue;
    }

    if (n.type === "image") {
      // ImageNode → "file" canvas node (best-effort; no Canvas "image" type).
      nodes.push({ ...nodeOutBase(n), type: "file", file: n.file });
      continue;
    }

    if (n.type === "group") {
      const out: CanvasNodeOut = { ...nodeOutBase(n), type: "group" };
      if (n.label !== undefined) out.label = n.label;
      nodes.push(out);
      continue;
    }

    if (n.type === "shape") {
      // LOSSY FALLBACK: Canvas has no geometry primitives. Approximate a
      // ShapeNode as a labeled text card using the shape's text label (or "").
      // Shape kind, fill color, stroke style, and roundness are all discarded.
      nodes.push({
        ...nodeOutBase(n),
        type: "text",
        text: n.text ?? "",
      });
      continue;
    }

    // LinearNode and DrawNode are SKIPPED — Canvas has no freeform line or
    // freehand stroke node type. These nodes are omitted from the export.
    if (n.type === "linear" || n.type === "draw") {
      continue;
    }
  }

  const edges: CanvasEdgeOut[] = file.edges.map((e) => {
    const out: CanvasEdgeOut = {
      id: e.id,
      fromNode: e.fromNode,
      toNode: e.toNode,
      ...(e.fromSide !== undefined ? { fromSide: e.fromSide } : {}),
      ...(e.toSide !== undefined ? { toSide: e.toSide } : {}),
      ...(e.color !== undefined ? { color: e.color } : {}),
      ...(e.label !== undefined ? { label: e.label } : {}),
      ...(e.fromEnd !== undefined ? { fromEnd: e.fromEnd } : {}),
      ...(e.toEnd !== undefined ? { toEnd: e.toEnd } : {}),
    };
    return out;
  });

  return { nodes, edges };
}
