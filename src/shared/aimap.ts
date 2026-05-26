// .aimap file format — our own. Single-app, single-user, no interop.
// Free to evolve. Derived from JSON Canvas 1.0 (typed nodes + edges) but
// extended at the root with our own metadata, viewport, and chat history.
//
// This module is the CANONICAL source of truth for the file-format types.
// The renderer's runtime stores (`src/renderer/store/nodes.ts`,
// `src/renderer/store/edges.ts`) import and re-export their node/edge types
// from here so there is a single definition. See plan §5.
//
// History: renamed from `src/shared/jsoncanvas.ts` in Phase 5 (PR 1/3). The
// old module held the now-superseded JSON Canvas 1.0 schema; this file
// replaces it with the `AimapFile` schema and adds Zod validators.
//
// IMPORTANT: this module is imported (transitively, via platform.ts) into the
// WEB bundle. It MUST NOT import anything from "electron" or Node-only APIs.
// Zod is browser-safe and is the only runtime dependency here.

import { z } from "zod";

/** Bumped on breaking schema changes. Migrations live in src/shared/migrations/. */
export const AIMAP_FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/** Hex string, e.g. "#6965db". */
export type HexColor = `#${string}`;
/** Preset palette index. "1" red | "2" orange | "3" yellow | "4" green | "5" cyan | "6" purple. */
export type PresetColor = "1" | "2" | "3" | "4" | "5" | "6";
/** Color: hex string OR a preset palette index "1".."6". Same convention as JSON Canvas. */
export type Color = HexColor | PresetColor;

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export type NodeType = "text" | "file" | "link" | "image" | "group";

/** Border line width tier. 1 thin · 2 medium · 4 bold (Excalidraw-style). */
export type StrokeWidth = 1 | 2 | 4;
/** Border line style. */
export type StrokeStyle = "solid" | "dashed" | "dotted";
/** Corner treatment: sharp (near-square) or round (Excalidraw-style). */
export type Roundness = "sharp" | "round";

export interface NodeBase {
  id: string; // required, unique within the file (uuid v4)
  type: NodeType;
  x: number; // integer pixels, +x right
  y: number; // integer pixels, +y down
  width: number;
  height: number;
  /**
   * Legacy / shorthand fill color. Retained for back-compat: when
   * `backgroundColor` is unset, the fill falls back to `color`. New writers
   * should prefer `backgroundColor`. See `resolveNodeStyle`.
   */
  color?: Color;
  parentId?: string; // id of containing GroupNode, if any (our extension)

  // --- Per-node style (optional; theme-aware defaults when unset) ----------
  // Added with the dark-mode fix (Phase 8). All optional → existing files and
  // tests parse unchanged. The renderer resolves these via `resolveNodeStyle`,
  // which fills in theme-appropriate defaults for any field left undefined.
  /** Card / container fill. Takes precedence over `color`. */
  backgroundColor?: Color;
  /** Border (stroke) color. */
  strokeColor?: Color;
  /** Text / glyph color. */
  fontColor?: Color;
  /** Border width tier (1 | 2 | 4). Default ~1.5 when unset. */
  strokeWidth?: StrokeWidth;
  /** Border line style. Default "solid" (groups default to dashed visually). */
  strokeStyle?: StrokeStyle;
  /** Node opacity, 0..100. Default 100 (fully opaque). */
  opacity?: number;
  /** Corner treatment. Default "round". */
  roundness?: Roundness;
}

export interface TextNode extends NodeBase {
  type: "text";
  text: string; // Markdown
}

export interface FileNode extends NodeBase {
  type: "file";
  file: string; // document-folder-relative path
  displayName?: string;
}

export interface LinkNode extends NodeBase {
  type: "link";
  url: string;
  title?: string;
  favicon?: string; // data URL or cached path
}

export interface ImageNode extends NodeBase {
  type: "image";
  file: string; // document-folder-relative path inside <file>.aimap.assets/
  alt?: string;
}

export interface GroupNode extends NodeBase {
  type: "group";
  label?: string;
  collapsed?: boolean;
}

/** Discriminated union of every node variant the file format supports. */
export type Node = TextNode | FileNode | LinkNode | ImageNode | GroupNode;

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export type EdgeSide = "top" | "right" | "bottom" | "left";
export type EdgeEnd = "none" | "arrow";

export interface Edge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
  fromEnd?: EdgeEnd; // default "none"
  toEnd?: EdgeEnd; // default "arrow"
  color?: Color;
  label?: string;
}

// ---------------------------------------------------------------------------
// Chat threads (optional, attached to a document)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: string; // ISO 8601
}

export interface ChatThread {
  id: string;
  createdAt: string; // ISO 8601
  messages: ChatMessage[];
}

// ---------------------------------------------------------------------------
// Document metadata + viewport
// ---------------------------------------------------------------------------

export interface AimapMeta {
  app: "AI-Mindmap";
  appVersion: string; // semver of the app that wrote the file
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface AimapViewport {
  x: number; // canvas-space pan offset
  y: number;
  zoom: number; // 0.1 .. 4.0
}

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

export interface AimapFile {
  /** Bumped on breaking schema changes. Migrations live in src/shared/migrations/. */
  formatVersion: 1;
  /** App metadata at last save. Informational; not load-gating. */
  meta: AimapMeta;
  /** Last-known viewport for this document. Restored on open. */
  viewport: AimapViewport;
  /** AI chat history attached to this document. Optional. */
  chats?: ChatThread[];
  nodes: Node[]; // required, may be empty
  edges: Edge[]; // required, may be empty
}

// ===========================================================================
// Zod validators — validate at the file-load boundary. Unknown fields are
// dropped (`.strip()` semantics, Zod's default for object schemas) per plan
// §5: no round-trip preservation.
// ===========================================================================

// Color: either a "#..." hex string or a "1".."6" preset.
const ZHexColor = z.custom<HexColor>(
  (v): v is HexColor => typeof v === "string" && v.startsWith("#"),
  { message: "expected a hex color string starting with '#'" },
);
const ZPresetColor = z.enum(["1", "2", "3", "4", "5", "6"]);
const ZColor: z.ZodType<Color> = z.union([ZHexColor, ZPresetColor]);

// Per-node style enums (mirror the StrokeWidth / StrokeStyle / Roundness types).
// `z.literal` union models the numeric strokeWidth tier; the others are string
// enums. All applied as `.optional()` on the node base so existing files parse.
const ZStrokeWidth = z.union([z.literal(1), z.literal(2), z.literal(4)]);
const ZStrokeStyle = z.enum(["solid", "dashed", "dotted"]);
const ZRoundness = z.enum(["sharp", "round"]);

const ZNodeBaseShape = {
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  color: ZColor.optional(),
  parentId: z.string().optional(),
  // Per-node style (optional; theme-aware defaults applied at render time).
  backgroundColor: ZColor.optional(),
  strokeColor: ZColor.optional(),
  fontColor: ZColor.optional(),
  strokeWidth: ZStrokeWidth.optional(),
  strokeStyle: ZStrokeStyle.optional(),
  opacity: z.number().min(0).max(100).optional(),
  roundness: ZRoundness.optional(),
};

const ZTextNode = z.object({
  ...ZNodeBaseShape,
  type: z.literal("text"),
  text: z.string(),
});

const ZFileNode = z.object({
  ...ZNodeBaseShape,
  type: z.literal("file"),
  file: z.string(),
  displayName: z.string().optional(),
});

const ZLinkNode = z.object({
  ...ZNodeBaseShape,
  type: z.literal("link"),
  url: z.string(),
  title: z.string().optional(),
  favicon: z.string().optional(),
});

const ZImageNode = z.object({
  ...ZNodeBaseShape,
  type: z.literal("image"),
  file: z.string(),
  alt: z.string().optional(),
});

const ZGroupNode = z.object({
  ...ZNodeBaseShape,
  type: z.literal("group"),
  label: z.string().optional(),
  collapsed: z.boolean().optional(),
});

export const ZNode = z.discriminatedUnion("type", [
  ZTextNode,
  ZFileNode,
  ZLinkNode,
  ZImageNode,
  ZGroupNode,
]);

const ZEdgeSide = z.enum(["top", "right", "bottom", "left"]);
const ZEdgeEnd = z.enum(["none", "arrow"]);

export const ZEdge = z.object({
  id: z.string(),
  fromNode: z.string(),
  toNode: z.string(),
  fromSide: ZEdgeSide.optional(),
  toSide: ZEdgeSide.optional(),
  fromEnd: ZEdgeEnd.optional(),
  toEnd: ZEdgeEnd.optional(),
  color: ZColor.optional(),
  label: z.string().optional(),
});

const ZChatThread = z.object({
  id: z.string(),
  createdAt: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      ts: z.string(),
    }),
  ),
});

const ZMeta = z.object({
  app: z.literal("AI-Mindmap"),
  appVersion: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ZViewport = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

/**
 * Zod schema mirroring `AimapFile`. Object schemas strip unknown keys by
 * default, so unknown root/node/edge fields are dropped on parse (plan §5).
 */
export const ZAimapFile = z.object({
  formatVersion: z.literal(1),
  meta: ZMeta,
  viewport: ZViewport,
  chats: z.array(ZChatThread).optional(),
  nodes: z.array(ZNode),
  edges: z.array(ZEdge),
});

/** A single Zod validation issue, flattened for display by sibling C. */
export interface AimapParseIssue {
  /** Dotted path to the offending field, e.g. "nodes.0.width". */
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; data: AimapFile }
  | { ok: false; error: string; issues: AimapParseIssue[] };

/**
 * Validate an unknown value against the `.aimap` schema.
 *
 * Returns a structured result (never throws) so the caller — including the
 * file-load UI (sibling C) — can show specific field-level errors. Unknown
 * fields are dropped from the returned `data`.
 *
 * NOTE: this validates a document that is ALREADY at the current
 * formatVersion. To load a document of unknown/older version, run it through
 * `migrate()` (src/shared/migrations) first, then parse the result here.
 */
export function parseAimapFile(raw: unknown): ParseResult {
  const result = ZAimapFile.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data as AimapFile };
  }
  const issues: AimapParseIssue[] = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  const first = issues[0];
  const error = first
    ? `Invalid .aimap file: ${first.path ? `${first.path}: ` : ""}${first.message}`
    : "Invalid .aimap file";
  return { ok: false, error, issues };
}

/**
 * Mint a fresh uuid-v4. Prefers `crypto.randomUUID` (modern browsers + Node
 * 19+); falls back to a short random suffix for jsdom + older runtimes.
 * Canonical id helper shared by the stores' `makeNodeId` / `makeEdgeId`.
 */
export function makeId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
