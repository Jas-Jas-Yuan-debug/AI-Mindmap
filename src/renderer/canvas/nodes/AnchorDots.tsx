// Per-node anchor dots — 4 small circles at top/right/bottom/left.
//
// Rendered INSIDE the TextNode Group (so the dots share the Group's
// translation: positions here are relative to the node's local origin,
// not absolute canvas coords). The host TextNode toggles the `visible`
// prop based on hover + selection so dots only show when relevant.
//
// Sibling B (drag-to-connect, Phase 3 PR 2) hit-tests these dots via
// Konva's `name` lookup. Each Circle's `name` is set to
// `"aim-anchor-dot <side>"` — Konva treats `name` as a whitespace-
// separated list of CSS-class-like tokens, so sibling B can:
//
//   - `stage.findOne(".aim-anchor-dot")` to test "did the pointer land
//     on any anchor dot"
//   - `node.name().split(" ")[1]` to read which side (top/right/
//     bottom/left) was hit
//
// Plus each dot carries its parent node's id as a custom Konva attr
// (`nodeId`) so the drop handler can resolve the edge endpoints
// without a tree walk.

import { Circle } from "react-konva";
import type { TextNode as TextNodeT } from "../../store/nodes.js";
import { useViewport } from "../../store/viewport.js";
import { useTool } from "../../store/tool.js";
import {
  anchorPosition,
  type EdgeSide,
} from "../edges/geometry.js";

const DOT_RADIUS_PX = 6;
const DOT_FILL = "#6965db"; // primary purple
const DOT_STROKE = "#ffffff";
const DOT_STROKE_WIDTH = 1.5;

const SIDES: EdgeSide[] = ["top", "right", "bottom", "left"];

export interface AnchorDotsProps {
  node: TextNodeT;
  visible: boolean;
}

export function AnchorDots({ node, visible }: AnchorDotsProps) {
  // Constant screen-pixel size for the dots — divide the desired CSS
  // radius by the current zoom so a dot stays 6px on screen at any
  // zoom level. Same trick TextNode uses for its resize handles.
  const zoom = useViewport((s) => s.zoom);
  // The "edge" tool reveals all anchor dots so drag-to-connect is discoverable.
  const edgeMode = useTool((s) => s.activeTool === "edge");

  if (!visible && !edgeMode) return null;

  const radius = DOT_RADIUS_PX / zoom;
  const strokeWidth = DOT_STROKE_WIDTH / zoom;

  // The dots are rendered inside the TextNode Group at (node.x, node.y)
  // in canvas space, so we pass a "local" rect `{0, 0, width, height}`
  // to `anchorPosition` — positions returned are already relative to
  // the Group's origin.
  const localRect = { x: 0, y: 0, width: node.width, height: node.height };

  return (
    <>
      {SIDES.map((side) => {
        const p = anchorPosition(localRect, side);
        return (
          <Circle
            key={side}
            // Konva accepts whitespace-separated names; sibling B reads
            // `.aim-anchor-dot` for the hit-test and the second token
            // for the side. Order matters — keep "aim-anchor-dot" first.
            name={`aim-anchor-dot ${side}`}
            // Stash the parent node id on the Konva attrs so the
            // drag-to-connect handler can resolve `fromNode` /
            // `toNode` from a hit-test alone.
            nodeId={node.id}
            side={side}
            x={p.x}
            y={p.y}
            radius={radius}
            fill={DOT_FILL}
            stroke={DOT_STROKE}
            strokeWidth={strokeWidth}
            strokeScaleEnabled={false}
            // Keep listening on (default) so sibling B's hit-test works.
          />
        );
      })}
    </>
  );
}

export default AnchorDots;
