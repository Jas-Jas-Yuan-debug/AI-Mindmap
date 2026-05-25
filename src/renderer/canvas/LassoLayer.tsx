import { Rect as KonvaRect } from "react-konva";
import type { Rect } from "./interactions/lasso.js";

// Phase 4: the visible marquee rectangle drawn while the user drags a lasso
// on empty canvas. Rendered INSIDE the Stage transform (in canvas coords) so
// it pans and scales with the content — the hook publishes the rect in canvas
// space and we draw it directly. `listening={false}` so the in-flight rect
// never steals pointer events from the nodes underneath or the stage's own
// drag tracking.
//
// Visuals match the Excalidraw selection marquee vibe: a thin dashed purple
// border with a faint translucent fill. Stroke is kept a constant screen
// width via strokeScaleEnabled={false} so it reads as ~1.5px at any zoom.

const STROKE = "#6965db"; // brand purple (matches selection ring)
const STROKE_WIDTH = 1.5;
const FILL = "rgba(105, 101, 219, 0.08)"; // faint purple wash

export interface LassoLayerProps {
  /** The lasso rect in canvas space, or null when not dragging. */
  rect: Rect | null;
}

export function LassoLayer({ rect }: LassoLayerProps) {
  if (!rect) return null;
  return (
    <KonvaRect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      stroke={STROKE}
      strokeWidth={STROKE_WIDTH}
      strokeScaleEnabled={false}
      dash={[6, 4]}
      fill={FILL}
      listening={false}
    />
  );
}

export default LassoLayer;
