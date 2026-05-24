import { useEffect, useState } from "react";
import { Layer, Stage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useViewport } from "../store/viewport.js";
import { useSettings } from "../store/settings.js";
import { useNodes } from "../store/nodes.js";
import { useSelection } from "../store/selection.js";
import { Grid } from "./Grid.js";
import { Origin } from "./Origin.js";
import { TextNodeCard } from "./nodes/TextNode.js";
import { usePan } from "./interactions/usePan.js";
import { useZoom } from "./interactions/useZoom.js";

// The viewport-driven Konva Stage. Owns its own size (responsive to window
// resize) and reads pan/zoom from the Zustand viewport store. Phase 1 PR 1
// rendered only the Origin debug crosshair inside; PR 2 wires pan/zoom
// interactions onto the Stage via the usePan / useZoom hooks; PR 3 adds
// the background Grid layer underneath the origin/content layer.
//
// Phase 2 PR 1 adds a Nodes layer between the Grid and the Origin:
//   - Grid Layer (back, listening:false) — background dots
//   - Nodes Layer (middle, listening:true) — TextNode cards from useNodes
//   - Origin Layer (front, listening:false) — debug crosshair stays visible
//
// Origin stays on top so a card placed at (0,0) doesn't hide the debug
// marker; we want to see "is this where I think it is?" through the card.
//
// Layer order matters in Konva — first <Layer> renders bottom, subsequent
// layers stack on top.

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
  const nodes = useNodes((s) => s.nodes);
  // Subscribe to the selection map (not the action functions) so a select
  // re-renders only the cards whose `selected` prop actually changed.
  const selectionIds = useSelection((s) => s.ids);

  const pan = usePan();
  const zoomI = useZoom();

  // Compose wheel: zoom owns ctrl/meta+wheel, pan owns plain wheel.
  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    if (zoomI.onWheel(e)) return;
    pan.onWheel(e);
  };

  // Stage-level click handler: if the user clicked the Stage itself (i.e.
  // empty canvas), clear the selection. Clicks on cards are handled by the
  // per-card `onSelect` and use `cancelBubble` semantics implicitly — Konva
  // events don't propagate from a Group to the Stage unless the Group
  // doesn't handle them, but reading `e.target === e.target.getStage()`
  // is the canonical Konva idiom for "empty canvas click."
  const onStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    // Pan starts on mousedown too; let it run first so it can claim the
    // event for middle-click / space-drag. usePan only acts on the
    // relevant button so calling it here is safe.
    pan.onMouseDown(e);
    if (e.target === e.target.getStage()) {
      useSelection.getState().clear();
    }
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
      onMouseDown={onStageMouseDown}
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
        {nodes.map((n) => (
          <TextNodeCard
            key={n.id}
            node={n}
            selected={Boolean(selectionIds[n.id])}
            onSelect={() => {
              // Single-select for Phase 2. Phase 4 will read modifier keys
              // off the event and call `select(id, true)` on Shift+click.
              useSelection.getState().select(n.id);
            }}
          />
        ))}
      </Layer>
      <Layer listening={false}>
        <Origin />
      </Layer>
    </Stage>
  );
}

export default Canvas;
