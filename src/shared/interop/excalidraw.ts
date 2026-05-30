/**
 * Excalidraw interop — bidirectional converters between our `.mindmap`
 * (AimapFile) format and the Excalidraw `.excalidraw` scene format.
 *
 * Notes on omissions:
 * - image elements are SKIPPED on import: Excalidraw stores image bytes in the
 *   `files{}` map keyed by a hash; our ImageNode needs a document-relative path
 *   which cannot be reconstructed without writing the blob to disk. Callers that
 *   need images must handle the extraction themselves.
 * - FileNode / LinkNode are exported as plain text elements (lossy). The url /
 *   file path is preserved as the text content but the semantics are lost.
 * - Edge export: each Edge is emitted as a straight arrow element between the
 *   centres of the two endpoint nodes. If either endpoint id is not found in the
 *   nodes array the edge is silently skipped.
 */

import type {
  AimapFile,
  Color,
  Node,
  ShapeNode,
  LinearNode,
  DrawNode,
  TextNode,
  Edge,
  StrokeWidth,
  StrokeStyle,
} from "../aimap.js";
import { makeId } from "../aimap.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Minimal shape of a parsed .excalidraw file. */
interface ExcalidrawScene {
  type: "excalidraw";
  version: number;
  elements: ExcalidrawElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

interface ExcalidrawElementBase {
  id?: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  roundness?: unknown;
  seed?: number;
  version?: number;
  versionNonce?: number;
  isDeleted?: boolean;
  boundElements?: unknown;
  updated?: number;
  link?: unknown;
  locked?: boolean;
  /** text element fields */
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  originalText?: string;
  lineHeight?: number;
  /** linear / freedraw point pairs */
  points?: [number, number][];
  lastCommittedPoint?: [number, number] | null;
}

type ExcalidrawElement = ExcalidrawElementBase;

// ---------------------------------------------------------------------------
// Preset colour palette  (our "1".."6" ↔ representative hex)
// ---------------------------------------------------------------------------

const PRESET_TO_HEX: Record<string, string> = {
  "1": "#e03131",
  "2": "#e8590c",
  "3": "#f08c00",
  "4": "#2f9e44",
  "5": "#1098ad",
  "6": "#6741d9",
};

function colorToHex(color: Color | undefined): string {
  if (!color) return "#1e1e1e";
  if (color.startsWith("#")) return color;
  return PRESET_TO_HEX[color] ?? "#1e1e1e";
}

function bgColorToHex(color: Color | undefined): string {
  if (!color) return "transparent";
  if (color.startsWith("#")) return color;
  return PRESET_TO_HEX[color] ?? "transparent";
}

/** Attempt to reverse a hex back to a preset; falls back to the hex itself. */
function hexToColor(hex: string): Color {
  if (!hex || hex === "transparent") return "#1e1e1e" as Color;
  for (const [preset, h] of Object.entries(PRESET_TO_HEX)) {
    if (h === hex) return preset as Color;
  }
  return hex as Color;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampStrokeWidth(v: number): StrokeWidth {
  if (v <= 1) return 1;
  if (v <= 2) return 2;
  return 4;
}

function toStrokeStyle(v: string | undefined): StrokeStyle {
  if (v === "dashed") return "dashed";
  if (v === "dotted") return "dotted";
  return "solid";
}

/** Flatten [x,y][] pairs → flat number[]. */
function flattenPoints(pts: [number, number][]): number[] {
  const out: number[] = [];
  for (const [x, y] of pts) {
    out.push(x, y);
  }
  return out;
}

/** Un-flatten flat number[] → [x,y][] pairs. */
function pairPoints(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push([flat[i]!, flat[i + 1]!]);
  }
  return out;
}

/** Build a valid empty AimapFile for error / unknown input cases. */
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

/** Stable pseudo-random seed derived from an id string. */
function idToSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

/** Build the mandatory boilerplate fields every Excalidraw element needs. */
function baseElement(id: string): Record<string, unknown> {
  return {
    id,
    angle: 0,
    roughness: 1,
    seed: idToSeed(id),
    version: 1,
    versionNonce: 0,
    isDeleted: false,
    groupIds: [],
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    fillStyle: "solid",
    roundness: null,
  };
}

// ---------------------------------------------------------------------------
// excalidrawToMindmap
// ---------------------------------------------------------------------------

/**
 * Parse a raw .excalidraw object and convert it to an AimapFile.
 * Tolerant of unknown / malformed input — never throws; returns an empty file
 * on bad input.
 */
export function excalidrawToMindmap(raw: unknown): AimapFile {
  try {
    return _excalidrawToMindmap(raw);
  } catch {
    return emptyAimapFile();
  }
}

function _excalidrawToMindmap(raw: unknown): AimapFile {
  if (
    raw === null ||
    typeof raw !== "object" ||
    !Array.isArray((raw as Record<string, unknown>)["elements"])
  ) {
    return emptyAimapFile();
  }

  const scene = raw as ExcalidrawScene;
  const elements: ExcalidrawElement[] = Array.isArray(scene.elements)
    ? scene.elements
    : [];

  // Build a map from element id → element so we can look up bound text later.
  const byId = new Map<string, ExcalidrawElement>();
  for (const el of elements) {
    if (el.id) byId.set(el.id, el);
  }

  // Collect text-element ids that are "containerId" of a shape (bound text).
  // We use them to attach text to shape nodes and skip them as standalone nodes.
  const boundTextIds = new Set<string>();
  for (const el of elements) {
    if (el.type === "text" && el.containerId) {
      boundTextIds.add(el.id ?? "");
    }
  }

  // Also build a reverse map: shape id → bound text content.
  const shapeText = new Map<string, string>();
  for (const el of elements) {
    if (el.type === "text" && el.containerId && el.text != null) {
      shapeText.set(el.containerId, el.text);
    }
  }

  const nodes: Node[] = [];

  for (const el of elements) {
    if (el.isDeleted) continue;

    const id = el.id ?? makeId("n");
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const width = el.width ?? 100;
    const height = el.height ?? 60;
    const opacity = el.opacity ?? 100;
    const strokeWidth = clampStrokeWidth(el.strokeWidth ?? 1);
    const strokeStyle = toStrokeStyle(el.strokeStyle);
    const strokeColor =
      el.strokeColor && el.strokeColor !== "#1e1e1e"
        ? (hexToColor(el.strokeColor) as Color)
        : undefined;
    const bgColorRaw = el.backgroundColor ?? "transparent";
    const backgroundColor =
      bgColorRaw !== "transparent"
        ? (hexToColor(bgColorRaw) as Color)
        : undefined;

    switch (el.type) {
      case "rectangle":
      case "diamond":
      case "ellipse": {
        const shape = el.type as "rectangle" | "diamond" | "ellipse";
        const text = shapeText.get(id);
        const node: ShapeNode = {
          id,
          type: "shape",
          shape,
          x,
          y,
          width,
          height,
          opacity,
          strokeWidth,
          strokeStyle,
          ...(strokeColor !== undefined ? { strokeColor } : {}),
          ...(backgroundColor !== undefined ? { backgroundColor } : {}),
          ...(text !== undefined ? { text } : {}),
        };
        nodes.push(node);
        break;
      }

      case "text": {
        // Skip if this is a bound text element (already merged into its shape).
        if (boundTextIds.has(id)) break;
        const textContent = el.text ?? "";
        const node: TextNode = {
          id,
          type: "text",
          text: textContent,
          x,
          y,
          width,
          height,
          opacity,
        };
        nodes.push(node);
        break;
      }

      case "arrow":
      case "line": {
        const linear = el.type as "arrow" | "line";
        const rawPts = Array.isArray(el.points) ? el.points : [];
        const pts = rawPts as [number, number][];
        const flat = flattenPoints(pts);
        const node: LinearNode = {
          id,
          type: "linear",
          linear,
          points: flat,
          x,
          y,
          width,
          height,
          opacity,
          strokeWidth,
          strokeStyle,
          ...(strokeColor !== undefined ? { strokeColor } : {}),
        };
        nodes.push(node);
        break;
      }

      case "freedraw": {
        const rawPts = Array.isArray(el.points) ? el.points : [];
        const pts = rawPts as [number, number][];
        const flat = flattenPoints(pts);
        const node: DrawNode = {
          id,
          type: "draw",
          points: flat,
          x,
          y,
          width,
          height,
          opacity,
          strokeWidth,
          ...(strokeColor !== undefined ? { strokeColor } : {}),
        };
        nodes.push(node);
        break;
      }

      case "image":
        // SKIPPED: Excalidraw stores image bytes in the `files{}` map keyed by
        // a data hash. Our ImageNode requires a document-relative file path on
        // disk; we cannot reconstruct that without writing the blob to disk,
        // which is out of scope for a pure converter. Callers that need images
        // should extract the blob and create an ImageNode themselves.
        break;

      default:
        // Unknown / future element types are silently ignored.
        break;
    }
  }

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
    nodes,
    edges: [],
  };
}

// ---------------------------------------------------------------------------
// mindmapToExcalidraw
// ---------------------------------------------------------------------------

type ExcalidrawOutput = {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

/**
 * Convert an AimapFile to an Excalidraw scene object (best-effort).
 * All required Excalidraw element fields are populated with sane defaults.
 */
export function mindmapToExcalidraw(file: AimapFile): ExcalidrawOutput {
  const elements: unknown[] = [];

  // Build node-centre lookup for edge arrow placement.
  const nodeCentre = new Map<string, { x: number; y: number }>();
  for (const node of file.nodes) {
    nodeCentre.set(node.id, {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    });
  }

  for (const node of file.nodes) {
    for (const el of nodeToElements(node)) {
      elements.push(el);
    }
  }

  // Emit edges as straight arrow elements.
  for (const edge of file.edges) {
    const from = nodeCentre.get(edge.fromNode);
    const to = nodeCentre.get(edge.toNode);
    if (!from || !to) {
      // One or both endpoint ids not found — skip silently (documented above).
      continue;
    }
    elements.push(edgeToArrowElement(edge, from, to));
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "https://ai-mindmap.app",
    elements,
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };
}

// ---------------------------------------------------------------------------
// Node → element(s) conversion helpers
// ---------------------------------------------------------------------------

function nodeToElements(node: Node): unknown[] {
  switch (node.type) {
    case "shape":
      return shapeNodeToElements(node);
    case "linear":
      return [linearNodeToElement(node)];
    case "draw":
      return [drawNodeToElement(node)];
    case "text":
      return [textNodeToElement(node)];
    case "group":
      return groupNodeToElements(node);
    case "file":
      // FileNode → text element showing the file path (lossy). The type: "file"
      // semantics (embedded document preview) cannot be represented in Excalidraw.
      return [
        makeTextElement(
          node.id,
          node.x,
          node.y,
          node.width,
          node.height,
          node.displayName ?? node.file,
          node.opacity,
        ),
      ];
    case "link":
      // LinkNode → text element showing the url (lossy). The type: "link"
      // semantics (live web-page preview) cannot be represented in Excalidraw.
      return [
        makeTextElement(
          node.id,
          node.x,
          node.y,
          node.width,
          node.height,
          node.title ?? node.url,
          node.opacity,
        ),
      ];
    case "image":
      // ImageNode is intentionally skipped for the same reason as the import
      // direction: we would need to embed the binary into files{} which is out
      // of scope for this converter.
      return [];
  }
}

function shapeNodeToElements(node: ShapeNode): unknown[] {
  const shapeEl: Record<string, unknown> = {
    ...baseElement(node.id),
    type: node.shape, // "rectangle" | "diamond" | "ellipse"
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    strokeColor: colorToHex(node.strokeColor),
    backgroundColor: bgColorToHex(node.backgroundColor),
    strokeWidth: node.strokeWidth ?? 1,
    strokeStyle: node.strokeStyle ?? "solid",
    opacity: node.opacity ?? 100,
  };

  const elements: unknown[] = [shapeEl];

  // If the shape has a text label, emit a separate text element. This is the
  // simplest approach and avoids the complexity of Excalidraw's bound-text
  // linking protocol (containerId ↔ boundElements cross-references).
  if (node.text != null && node.text !== "") {
    const textId = makeId("t");
    elements.push(
      makeTextElement(
        textId,
        node.x + node.width / 2 - 60, // approximate centre
        node.y + node.height / 2 - 10,
        120,
        20,
        node.text,
        node.opacity,
      ),
    );
  }

  return elements;
}

function linearNodeToElement(node: LinearNode): unknown {
  const pts = pairPoints(node.points);
  return {
    ...baseElement(node.id),
    type: node.linear, // "line" | "arrow"
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    strokeColor: colorToHex(node.strokeColor),
    backgroundColor: "transparent",
    strokeWidth: node.strokeWidth ?? 1,
    strokeStyle: node.strokeStyle ?? "solid",
    opacity: node.opacity ?? 100,
    points: pts.length > 0 ? pts : [[0, 0] as [number, number], [node.width, node.height] as [number, number]],
    lastCommittedPoint: null,
  };
}

function drawNodeToElement(node: DrawNode): unknown {
  const pts = pairPoints(node.points);
  return {
    ...baseElement(node.id),
    type: "freedraw",
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    strokeColor: colorToHex(node.strokeColor),
    backgroundColor: "transparent",
    strokeWidth: node.strokeWidth ?? 1,
    strokeStyle: node.strokeStyle ?? "solid",
    opacity: node.opacity ?? 100,
    points: pts,
    lastCommittedPoint: null,
  };
}

function textNodeToElement(node: TextNode): unknown {
  return makeTextElement(
    node.id,
    node.x,
    node.y,
    node.width,
    node.height,
    node.text,
    node.opacity,
  );
}

function makeTextElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  opacity: number | undefined,
): unknown {
  return {
    ...baseElement(id),
    type: "text",
    x,
    y,
    width,
    height,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    strokeWidth: 1,
    strokeStyle: "solid",
    opacity: opacity ?? 100,
    text,
    fontSize: 20,
    fontFamily: 1,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    originalText: text,
    lineHeight: 1.25,
  };
}

function groupNodeToElements(node: import("../aimap.js").GroupNode): unknown[] {
  const rectEl: Record<string, unknown> = {
    ...baseElement(node.id),
    type: "rectangle",
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    strokeColor: colorToHex(node.strokeColor),
    backgroundColor: bgColorToHex(node.backgroundColor),
    strokeWidth: node.strokeWidth ?? 1,
    strokeStyle: "dashed", // groups are visually dashed by convention
    opacity: node.opacity ?? 100,
  };

  const elements: unknown[] = [rectEl];

  if (node.label) {
    const textId = makeId("t");
    elements.push(
      makeTextElement(
        textId,
        node.x + 8,
        node.y + 4,
        node.width - 16,
        24,
        node.label,
        node.opacity,
      ),
    );
  }

  return elements;
}

function edgeToArrowElement(
  edge: Edge,
  from: { x: number; y: number },
  to: { x: number; y: number },
): unknown {
  const id = edge.id;
  // The arrow's x,y is the "from" centre; the single point offset [dx,dy]
  // points to the "to" centre. Excalidraw arrow points are LOCAL to (x,y).
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const strokeColor = edge.color ? colorToHex(edge.color as Color) : "#1e1e1e";

  return {
    ...baseElement(id),
    type: "arrow",
    x: from.x,
    y: from.y,
    width: Math.abs(dx),
    height: Math.abs(dy),
    strokeColor,
    backgroundColor: "transparent",
    strokeWidth: 1,
    strokeStyle: "solid",
    opacity: 100,
    points: [
      [0, 0] as [number, number],
      [dx, dy] as [number, number],
    ],
    lastCommittedPoint: null,
  };
}
