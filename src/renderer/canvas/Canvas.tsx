import { useEffect, useState } from "react";
import { Layer, Stage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useViewport } from "../store/viewport.js";
import { Origin } from "./Origin.js";
import { usePan } from "./interactions/usePan.js";
import { useZoom } from "./interactions/useZoom.js";

// The viewport-driven Konva Stage. Owns its own size (responsive to window
// resize) and reads pan/zoom from the Zustand viewport store. Phase 1 PR 1
// renders only the Origin debug crosshair inside; PR 2 wires the pan/zoom
// interaction hooks (this file); PR 3 will add the grid layer.

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
      <Layer>
        <Origin />
      </Layer>
    </Stage>
  );
}

export default Canvas;
