// Toolbar.tsx — full V2 tool palette.
// Groups: [Navigation] | [Shapes] | [Lines & Marks] | [Content] | [Erase] | [Lock]
// The lock toggle is NOT a tool; it calls useLock.toggle() and lives in its
// own cluster, visually separated from the drawing tools.

import {
  MousePointer2,
  Hand,
  SquareDashedMousePointer,
  Square,
  Diamond,
  Circle,
  Minus,
  ArrowUpRight,
  Pencil,
  Spline,
  Type,
  Image,
  Link2,
  Group,
  Eraser,
  Lock,
  LockOpen,
} from "lucide-react";
import { Island } from "./Island.js";
import { useLock } from "../store/lock.js";
import type { Tool } from "../store/tool.js";
import "./Toolbar.css";

// ─── Tool descriptor ────────────────────────────────────────────────────────

type ToolDef = {
  id: Tool;
  label: string;
  /** Single uppercase letter shown as tooltip hint, or empty string. */
  shortcut: string;
  Icon: typeof MousePointer2;
};

// ─── Cluster declarations ────────────────────────────────────────────────────
// Each cluster is an array of ToolDef. The order within a cluster is the
// visual order; clusters are separated by thin dividers.

const NAVIGATION_CLUSTER: ToolDef[] = [
  { id: "select",  label: "Select",   shortcut: "V", Icon: MousePointer2 },
  { id: "hand",    label: "Pan",       shortcut: "H", Icon: Hand },
  { id: "marquee", label: "Box select", shortcut: "M", Icon: SquareDashedMousePointer },
];

const SHAPES_CLUSTER: ToolDef[] = [
  { id: "rectangle", label: "Rectangle", shortcut: "R", Icon: Square },
  { id: "diamond",   label: "Diamond",   shortcut: "D", Icon: Diamond },
  { id: "ellipse",   label: "Ellipse",   shortcut: "O", Icon: Circle },
];

const MARKS_CLUSTER: ToolDef[] = [
  { id: "line",  label: "Line",   shortcut: "",  Icon: Minus },
  { id: "arrow", label: "Arrow",  shortcut: "A", Icon: ArrowUpRight },
  { id: "draw",  label: "Draw",   shortcut: "P", Icon: Pencil },
];

const CONTENT_CLUSTER: ToolDef[] = [
  { id: "text",  label: "Text",   shortcut: "T", Icon: Type },
  { id: "image", label: "Image",  shortcut: "I", Icon: Image },
  { id: "link",  label: "Link",   shortcut: "L", Icon: Link2 },
  { id: "edge",  label: "Edge",   shortcut: "E", Icon: Spline },
  { id: "group", label: "Group",  shortcut: "G", Icon: Group },
];

const ERASE_CLUSTER: ToolDef[] = [
  { id: "eraser", label: "Eraser", shortcut: "X", Icon: Eraser },
];

// ─── Component helpers ────────────────────────────────────────────────────────

function ToolCluster({
  tools,
  activeTool,
  onSelectTool,
}: {
  tools: ToolDef[];
  activeTool: Tool;
  // Required-but-nullable (not optional) so callers can forward the parent's
  // possibly-undefined handler under exactOptionalPropertyTypes.
  onSelectTool: ((t: Tool) => void) | undefined;
}) {
  return (
    <span className="aim-toolbar__cluster">
      {tools.map(({ id, label, shortcut, Icon }) => {
        const title = shortcut ? `${label} — ${shortcut}` : label;
        const ariaLabel = shortcut ? `${label} (${shortcut})` : label;
        return (
          <button
            key={id}
            type="button"
            className="aim-icon-button"
            aria-label={ariaLabel}
            title={title}
            aria-pressed={activeTool === id}
            data-shortcut={shortcut || undefined}
            onClick={() => onSelectTool?.(id)}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        );
      })}
    </span>
  );
}

function Divider() {
  return <span className="aim-toolbar__divider" aria-hidden="true" />;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ToolbarProps {
  activeTool?: Tool;
  onSelectTool?: (t: Tool) => void;
}

export function Toolbar({ activeTool = "select", onSelectTool }: ToolbarProps) {
  const locked = useLock((s) => s.locked);
  const toggle = useLock((s) => s.toggle);

  const LockIcon = locked ? Lock : LockOpen;
  const lockLabel = locked ? "Unlock canvas" : "Lock canvas";

  return (
    <Island className="aim-island--row aim-toolbar--root" ariaLabel="Tool palette">

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <ToolCluster
        tools={NAVIGATION_CLUSTER}
        activeTool={activeTool}
        onSelectTool={onSelectTool}
      />

      <Divider />

      {/* ── Shapes ──────────────────────────────────────────────────────── */}
      <ToolCluster
        tools={SHAPES_CLUSTER}
        activeTool={activeTool}
        onSelectTool={onSelectTool}
      />

      <Divider />

      {/* ── Lines & marks ───────────────────────────────────────────────── */}
      <ToolCluster
        tools={MARKS_CLUSTER}
        activeTool={activeTool}
        onSelectTool={onSelectTool}
      />

      <Divider />

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <ToolCluster
        tools={CONTENT_CLUSTER}
        activeTool={activeTool}
        onSelectTool={onSelectTool}
      />

      <Divider />

      {/* ── Eraser ──────────────────────────────────────────────────────── */}
      <ToolCluster
        tools={ERASE_CLUSTER}
        activeTool={activeTool}
        onSelectTool={onSelectTool}
      />

      <Divider />

      {/* ── Lock (canvas freeze — not a drawing tool) ────────────────────── */}
      <span className="aim-toolbar__cluster">
        <button
          type="button"
          className="aim-icon-button aim-toolbar__lock"
          aria-label={lockLabel}
          title={lockLabel}
          aria-pressed={locked}
          onClick={toggle}
        >
          <LockIcon size={16} strokeWidth={1.75} />
        </button>
      </span>

    </Island>
  );
}
