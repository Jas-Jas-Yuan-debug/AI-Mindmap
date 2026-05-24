import { Canvas } from "./canvas/Canvas.js";
import { Chrome } from "./ui/Chrome.js";
import { NodeOverlayLayer } from "./ui/NodeOverlayLayer.js";

// App is a thin shell. Layer composition (back → front):
//   <Canvas />          — Konva Stage, owns viewport / pan / zoom / card rects.
//   <NodeOverlayLayer />— HTML overlays per node: react-markdown view +
//                         edit-mode textarea + right-click color picker.
//                         Tracks the viewport via store subscriptions so
//                         overlays stay aligned with the Konva cards during
//                         pan/zoom. Wrapper is pointer-events: none so the
//                         Konva Stage still handles empty-canvas clicks.
//   <Chrome />          — Floating Islands (z: 100): main menu, toolbar,
//                         zoom controls, status bar, etc.
//
// App.tsx itself holds no canvas state — that responsibility lives in the
// canvas/ directory and the Zustand slices.
export default function App() {
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Canvas />
      <NodeOverlayLayer />
      <Chrome />
    </div>
  );
}
