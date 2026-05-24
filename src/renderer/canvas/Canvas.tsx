import { useEffect, useState } from "react";
import { Layer, Stage } from "react-konva";
import { useViewport } from "../store/viewport.js";
import { Origin } from "./Origin.js";

// The viewport-driven Konva Stage. Owns its own size (responsive to window
// resize) and reads pan/zoom from the Zustand viewport store. Phase 1 PR 1
// renders only the Origin debug crosshair inside; pan/zoom interactions
// (PR 2) and grid (PR 3) will add more layers/handlers later.

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

  return (
    <Stage
      width={width}
      height={height}
      x={x}
      y={y}
      scaleX={zoom}
      scaleY={zoom}
      style={{ background: "var(--aim-color-canvas-bg)" }}
    >
      <Layer>
        <Origin />
      </Layer>
    </Stage>
  );
}

export default Canvas;
