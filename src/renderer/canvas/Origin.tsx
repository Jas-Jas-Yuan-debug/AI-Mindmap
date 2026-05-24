import { Line } from "react-konva";

// Origin crosshair — a small "+" centered at canvas (0, 0). Phase 1 ships
// this as a debug marker while the canvas has no real content yet; per
// plan §6 Phase 1 it will eventually be toggleable from Settings (Phase 8).
// For now `visible` defaults to true; callers can pass `visible={false}`
// to hide it without removing the component.

const RADIUS = 12; // half-length of each crosshair arm, in canvas pixels.
const STROKE = "#94a3b8"; // slate-400; visible on light + dark backgrounds.
const STROKE_WIDTH = 1;

export interface OriginProps {
  visible?: boolean;
}

export function Origin({ visible = true }: OriginProps) {
  if (!visible) return null;
  return (
    <>
      <Line
        points={[-RADIUS, 0, RADIUS, 0]}
        stroke={STROKE}
        strokeWidth={STROKE_WIDTH}
        listening={false}
        // Keep the crosshair a constant 1px regardless of zoom — otherwise
        // a 4x zoom would draw a 4px-thick plus, which dominates the view.
        strokeScaleEnabled={false}
      />
      <Line
        points={[0, -RADIUS, 0, RADIUS]}
        stroke={STROKE}
        strokeWidth={STROKE_WIDTH}
        listening={false}
        strokeScaleEnabled={false}
      />
    </>
  );
}

export default Origin;
