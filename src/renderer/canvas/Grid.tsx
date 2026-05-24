import { useEffect, useState, type ReactNode } from "react";
import { Circle, Group } from "react-konva";
import { useViewport } from "../store/viewport.js";
import { effectiveStep } from "./grid-math.js";
import { screenToCanvas } from "./layout.js";

// Dotted infinite-grid layer.
//
// Drawn inside the Konva Stage so it shares pan/zoom transform with the rest
// of the canvas content. Because everything inside the Stage is transformed
// by (Stage.x, Stage.y, Stage.scale), this component reasons purely in
// canvas-space coordinates — we just hand Konva a circle at each (x, y) in
// canvas space and the Stage transforms it into the right screen position.
//
// Two design choices worth calling out:
//
//   1. **Adaptive step.** A fixed 20-canvas-unit dot spacing looks dense at
//      zoom 0.1× (200 dots per 1000 screen px) and sparse at 4× (5 dots per
//      1000 screen px). To keep on-screen dot density visually-similar at
//      every zoom level, we multiply the base step by the nearest power of 2
//      that compensates for the current zoom. At zoom 1× the effective step
//      is 20; at zoom 0.5× it's 40; at zoom 0.25× it's 80; at zoom 2× it's
//      10 (or stays 20 depending on the rounding boundary), etc. Powers of
//      two are chosen so the grid never "shifts under your feet" mid-zoom —
//      dots that exist at one step size are a strict subset of the dots at
//      the next larger step size.
//
//   2. **Viewport culling.** Naively iterating over the entire infinite plane
//      would draw millions of dots at low zoom. We compute the canvas-space
//      window currently visible on screen, then only iterate within that
//      rectangle. Dot count is ~(viewport_width / step) × (viewport_height /
//      step), which is in the hundreds, not millions.
//
// Visibility is controlled by the settings store; this component only renders
// when called — gating happens in Canvas.tsx via `useSettings(s =>
// s.gridVisible)`.

/** Subtle gray that reads on both light and dark canvas backgrounds. */
const DOT_COLOR = "#c7d2db";

/** Track window size so culling adapts to viewport resizes. */
function useWindowSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const onResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export function Grid() {
  const x = useViewport((s) => s.x);
  const y = useViewport((s) => s.y);
  const zoom = useViewport((s) => s.zoom);
  const { width, height } = useWindowSize();

  const viewport = { x, y, zoom };
  const step = effectiveStep(zoom);

  // Visible canvas-space window: the screen rect [0, width] × [0, height]
  // mapped backward through the viewport transform. `screenToCanvas` is the
  // inverse of what Konva applies to children inside the Stage.
  const topLeft = screenToCanvas({ x: 0, y: 0 }, viewport);
  const bottomRight = screenToCanvas({ x: width, y: height }, viewport);

  // Snap to the nearest multiple of `step` below (top-left) and above
  // (bottom-right) so the grid is aligned to canvas-space, not to the
  // current pan offset. This keeps dots stable when you scroll — dots
  // anchor to their canvas-space positions, they don't follow the cursor.
  const startX = Math.floor(topLeft.x / step) * step;
  const endX = Math.ceil(bottomRight.x / step) * step;
  const startY = Math.floor(topLeft.y / step) * step;
  const endY = Math.ceil(bottomRight.y / step) * step;

  // Dot radius in canvas-space targets ~1px on screen. Konva applies
  // strokeScaleEnabled / scale to the Stage; here we draw a filled circle
  // and scale its radius inversely with zoom. (Equivalent to telling
  // Konva "make this look 1px regardless of zoom.")
  const radius = 1 / Math.max(zoom, 0.0001);

  const dots: ReactNode[] = [];
  // Cap dots as a safety net against pathological zoom/pan combos. In normal
  // viewports the actual count is in the low hundreds; this guard just
  // protects React/Konva from being asked to render a million children if
  // someone passes an absurd window size or zoom.
  const MAX_DOTS = 5000;
  let count = 0;
  for (let gx = startX; gx <= endX && count < MAX_DOTS; gx += step) {
    for (let gy = startY; gy <= endY && count < MAX_DOTS; gy += step) {
      dots.push(
        <Circle
          key={`${gx},${gy}`}
          x={gx}
          y={gy}
          radius={radius}
          fill={DOT_COLOR}
          listening={false}
        />,
      );
      count++;
    }
  }

  return (
    <Group listening={false} aria-label="Background grid">
      {dots}
    </Group>
  );
}

export default Grid;
