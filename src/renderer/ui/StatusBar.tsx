import { useEffect, useState } from "react";
import { screenToCanvas } from "../canvas/layout.js";
import { useViewport } from "../store/viewport.js";
import { Island } from "./Island.js";
import "./StatusBar.css";

// Bottom-right status indicator: current zoom % and cursor canvas coords.
//
// Two pieces of state:
//   - `zoom` from the viewport store (re-renders on zoom changes).
//   - `cursor` tracked via a window mousemove listener; converted from
//     screen-space (clientX/clientY) to canvas-space using the same math the
//     rest of the canvas uses, so the displayed coords match what nodes will
//     report once Phase 2 lands.
//
// Lives outside the Konva Stage as an HTML overlay (it's chrome, not canvas
// content). Reuses the existing <Island> primitive for visual consistency
// with the other floating chrome clusters.

export function StatusBar() {
  const zoom = useViewport((s) => s.zoom);
  // Track viewport pan/zoom for the cursor math; subscribe individually so
  // we re-render whenever any of them changes. We re-read getState() at the
  // mousemove handler so the listener doesn't need to be recreated on every
  // viewport update (which would thrash event handlers).
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = (e: MouseEvent) => {
      const v = useViewport.getState();
      const c = screenToCanvas({ x: e.clientX, y: e.clientY }, v);
      setCursor({ x: Math.round(c.x), y: Math.round(c.y) });
    };
    const onLeave = () => setCursor(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const pct = Math.round(zoom * 100);
  // When the cursor hasn't moved yet (initial render, or it left the
  // window), show em-dashes rather than a stale or jumpy value.
  const coords = cursor ? `(${cursor.x}, ${cursor.y})` : "(—, —)";

  return (
    <Island className="aim-statusbar" ariaLabel="Status">
      <span className="aim-statusbar__item" title="Current zoom level">
        Zoom: <span className="aim-statusbar__value">{pct}%</span>
      </span>
      <span className="aim-statusbar__divider" aria-hidden="true" />
      <span className="aim-statusbar__item" title="Cursor position in canvas coordinates">
        Cursor: <span className="aim-statusbar__value">{coords}</span>
      </span>
    </Island>
  );
}

export default StatusBar;
