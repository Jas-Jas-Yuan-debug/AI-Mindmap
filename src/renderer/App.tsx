import { Canvas } from "./canvas/Canvas.js";
import { Chrome } from "./ui/Chrome.js";

// App is a thin shell: <Canvas /> owns the Konva Stage + viewport state,
// <Chrome /> owns the floating UI Islands on top. App.tsx itself holds
// no canvas/viewport state — that responsibility lives in the canvas/
// directory and the Zustand viewport slice.
export default function App() {
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Canvas />
      <Chrome />
    </div>
  );
}
