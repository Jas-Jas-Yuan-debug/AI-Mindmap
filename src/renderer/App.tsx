import { useEffect, useState } from "react";
import { Stage, Layer, Rect, Text } from "react-konva";

const ROOT_LABEL = "Root";
const ROOT_WIDTH = 160;
const ROOT_HEIGHT = 64;
const ROOT_RADIUS = 14;

function useViewportSize() {
  const [size, setSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });
  useEffect(() => {
    const onResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export default function App() {
  const { width, height } = useViewportSize();
  const rectX = (width - ROOT_WIDTH) / 2;
  const rectY = (height - ROOT_HEIGHT) / 2;

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#ffffff" }}>
      <Stage width={width} height={height}>
        <Layer>
          <Rect
            x={rectX}
            y={rectY}
            width={ROOT_WIDTH}
            height={ROOT_HEIGHT}
            cornerRadius={ROOT_RADIUS}
            fill="#2d6cdf"
            stroke="#5b8def"
            strokeWidth={1.5}
          />
          <Text
            x={rectX}
            y={rectY}
            width={ROOT_WIDTH}
            height={ROOT_HEIGHT}
            text={ROOT_LABEL}
            fontSize={18}
            fontStyle="600"
            fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            fill="#ffffff"
            align="center"
            verticalAlign="middle"
          />
        </Layer>
      </Stage>
    </div>
  );
}
