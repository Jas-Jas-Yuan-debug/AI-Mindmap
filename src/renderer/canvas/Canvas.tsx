import { useEffect, useState } from "react";
import { Layer, Stage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useViewport } from "../store/viewport.js";
import { useSettings } from "../store/settings.js";
import { Grid } from "./Grid.js";
import { Origin } from "./Origin.js";
import { usePan } from "./interactions/usePan.js";
import { useZoom } from "./interactions/useZoom.js";

// The viewport-driven Konva Stage. Owns its own size (responsive to window
// resize) and reads pan/zoom from the Zustand viewport store. Phase 1 PR 1
// rendered only the Origin debug crosshair inside; PR 2 wires pan/zoom
// interactions onto the Stage via the usePan / useZoom hooks; PR 3 adds
// the background Grid layer underneath the origin/content layer.
//
// Layer order matters in Konva — first <Layer> renders bottom, subsequent
// layers stack on top. The Grid sits at the back so future nodes/edges
// render over it. The Origin crosshair sits in the content layer with the
// rest of the (future) canvas content.

function useStageSize() {
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

export function Canvas() {
  const { width, height } = useStageSize();
  const x = useViewport((s) => s.x);
  const y = useViewport((s) => s.y);
  const zoom = useViewport((s) => s.zoom);
  const gridVisible = useSettings((s) => s.gridVisible);

  const pan = usePan();
  const zoomI = useZoom();

  // Compose wheel: zoom owns ctrl/meta+wheel, pan owns plain wheel.
  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    if (zoomI.onWheel(e)) return;
    pan.onWheel(e);
  };

  return (
    <Stage
      width={width}
      height={height}
      x={x}
      y={y}
      scaleX={zoom}
      scaleY={zoom}
      style={{ background: "var(--aim-color-canvas-bg)", cursor: pan.cursor }}
      onMouseDown={pan.onMouseDown}
      onMouseMove={pan.onMouseMove}
      onMouseUp={pan.onMouseUp}
      onMouseLeave={pan.onMouseLeave}
      onWheel={onWheel}
    >
      {gridVisible ? (
        <Layer listening={false}>
          <Grid />
        </Layer>
      ) : null}
      <Layer>
        <Origin />
      </Layer>
    </Stage>
  );
}

export default Canvas;
