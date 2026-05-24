// Konva renderer for a single TextNode card.
//
// Phase 2 scope split (3 sibling subagents, one phase):
//   - Subagent A (this PR): renders the *card shape* — the rounded rect
//     background + border + selection ring. NO text content, NO drag, NO
//     resize handles.
//   - Subagent B: drag-to-move + resize handles + delete + double-click
//     create. Wraps this component or its parent <Group>.
//   - Subagent C: HTML <textarea>/markdown overlay positioned over this
//     rect via canvasToScreen — the text itself is rendered in the DOM,
//     not in Konva. (Konva text doesn't do markdown, and an overlay is
//     trivial to position with the existing layout helpers.)
//
// That's why the import list here is intentionally tiny — react-konva
// only, no text primitives. Sibling B and C build on top of the public
// exports below (`TextNodeCard`, `resolveColor`, `PRESET_COLOR_MAP`).

import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Rect } from "react-konva";
import type { Color, PresetColor, TextNode } from "../../store/nodes.js";

/**
 * Preset color id ("1".."6", per plan §5) → concrete hex.
 *
 * Hues chosen to align with the Mantine / Excalidraw color tier the rest
 * of the app uses; preset "6" is the Excalidraw purple `#6965db` we picked
 * as our primary brand color (plan §5b design tokens). Sibling C's color
 * picker should render swatches in this order.
 *
 * Exported so the color picker (sibling C) can reuse the canonical hex
 * values rather than re-defining them.
 */
export const PRESET_COLOR_MAP: Record<PresetColor, string> = {
  "1": "#fa5252", // red
  "2": "#fd7e14", // orange
  "3": "#fab005", // yellow
  "4": "#40c057", // green
  "5": "#15aabf", // cyan
  "6": "#6965db", // purple — our primary
};

/**
 * Resolve a `Color` (preset id or hex literal) to a concrete hex string.
 *
 * Falls back to white (`#ffffff`) when no color is set; Phase 8 will swap
 * the fallback for a themed default driven by `data-theme="dark"`.
 *
 * Exported for sibling C's color picker preview UI.
 */
export function resolveColor(c: Color | undefined): string {
  if (!c) return "#ffffff";
  if (typeof c === "string" && c.startsWith("#")) return c;
  return PRESET_COLOR_MAP[c as PresetColor] ?? "#ffffff";
}

// --- Visual constants -------------------------------------------------
//
// Border radius matches Excalidraw's card vibe (plan §5b). The selection
// ring uses the brand primary `#6965db` — keeping the hex literal here
// (instead of var(--aim-color-primary)) because Konva renders to canvas
// and can't read CSS custom properties. Phase 8 will plumb theme values
// down via a small palette helper.

const BORDER_RADIUS = 12;
const BORDER_COLOR = "#cbd5e1"; // slate-300, subtle on white
const BORDER_WIDTH = 1;
const SELECTED_BORDER_COLOR = "#6965db"; // Excalidraw purple (primary)
const SELECTED_BORDER_WIDTH = 2;

export interface TextNodeCardProps {
  node: TextNode;
  selected: boolean;
  /**
   * Called on pointer-down (mousedown / touchstart). Wired by Canvas.tsx
   * to drive selection. Sibling B may upgrade this to also begin a drag.
   * Receives the Konva event object so callers can read modifier keys
   * (Shift, Cmd/Ctrl) from `e.evt`.
   *
   * Typed against MouseEvent because Konva's prop typings model
   * `onMouseDown` as MouseEvent-only; touch input still reaches the
   * handler through Konva's pointer abstraction at runtime.
   */
  onSelect?: (e: KonvaEventObject<MouseEvent>) => void;
}

/**
 * Single Konva card. Rendered inside the Canvas content Layer, one per
 * node in `useNodes().nodes`. Group wraps the rect so sibling B can add
 * resize handles inside the same `<Group>` later without restructuring.
 */
export function TextNodeCard({ node, selected, onSelect }: TextNodeCardProps) {
  const fill = resolveColor(node.color);
  // Build optional pointer-event handlers conditionally so we don't pass
  // `undefined` under exactOptionalPropertyTypes. Konva's prop types
  // declare these as required-when-present, and the MouseEvent and
  // TouchEvent handler signatures aren't structurally compatible — so we
  // type the touch handler via a thin cast to the mouse signature.
  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};
  return (
    <Group
      x={node.x}
      y={node.y}
      // `name` lets future hit-test code identify cards (used by sibling B's
      // delete-on-click and by Phase 4 lasso).
      name="text-node"
      // Stash the id on the Konva node so the parent Stage's click handler
      // (Canvas.tsx) can read it off `e.target.getParent()` without needing
      // a closure over props.
      id={node.id}
      {...pointerHandlers}
    >
      <Rect
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        cornerRadius={BORDER_RADIUS}
        fill={fill}
        stroke={selected ? SELECTED_BORDER_COLOR : BORDER_COLOR}
        strokeWidth={selected ? SELECTED_BORDER_WIDTH : BORDER_WIDTH}
        // Keep the border visually constant under zoom — a 1px line at
        // zoom 4 should still look like 1px, matching the Origin marker
        // and the rest of the chrome.
        strokeScaleEnabled={false}
        // Subtle shadow only when selected so the focus ring reads even
        // against a same-color background. Light enough that 100 cards
        // don't tank perf (Konva caches the shadow per node).
        shadowEnabled={selected}
        shadowColor="#6965db"
        shadowBlur={6}
        shadowOpacity={0.25}
      />
    </Group>
  );
}

export default TextNodeCard;
