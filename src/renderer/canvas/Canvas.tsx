import { Fragment, useEffect, useState } from "react";
import { Group, Layer, Stage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useViewport } from "../store/viewport.js";
import { useSettings } from "../store/settings.js";
import { useNodes } from "../store/nodes.js";
import { useSelection } from "../store/selection.js";
import { Grid } from "./Grid.js";
import { Origin } from "./Origin.js";
import { TextNodeCard } from "./nodes/TextNode.js";
import { AnchorDots } from "./nodes/AnchorDots.js";
import { EdgesLayer } from "./edges/EdgesLayer.js";
import { EdgeDraft } from "./edges/EdgeDraft.js";
import { useDrawEdge } from "./edges/useDrawEdge.js";
import { usePan } from "./interactions/usePan.js";
import { useZoom } from "./interactions/useZoom.js";
import { useDeleteKey } from "./interactions/useDeleteKey.js";
import { useCreate } from "./interactions/useCreate.js";

// The viewport-driven Konva Stage. Owns its own size (responsive to window
// resize) and reads pan/zoom from the Zustand viewport store. Phase 1 PR 1
// rendered only the Origin debug crosshair inside; PR 2 wires pan/zoom
// interactions onto the Stage via the usePan / useZoom hooks; PR 3 adds
// the background Grid layer underneath the origin/content layer.
//
// Phase 2 PR 1 added a Nodes layer between the Grid and the Origin.
// Phase 3 PR 1 (sibling A) inserts the Edges layer UNDER the Nodes layer
// so arrows pass behind cards (matches Excalidraw's mental model and
// avoids drawing the connector ON TOP of the card it's pointing at).
// Phase 3 PR 2 (this branch) adds:
//   - AnchorDots per TextNode (the four small grab handles). They use
//     LOCAL coords inside their parent Group, so we wrap each instance in
//     a Konva <Group x={node.x} y={node.y}> at the node's canvas
//     position. Rendering them as a sibling of the TextNode Group keeps
//     us out of `TextNode.tsx` (sibling C's file) and lets the dots
//     visually overlap the card's selection ring.
//   - A thin EdgeDraft layer between the Edges layer and the Nodes layer
//     so the "ghost" Bezier drawn during drag-to-connect renders above
//     committed edges but below the cards.
//   - useDrawEdge() hook, composed with usePan: an anchor-dot mousedown
//     short-circuits the pan handler so the user doesn't start panning
//     while drawing an edge.
//
// Layer order (back → front):
//   - Grid Layer   (listening:false, only when gridVisible)
//   - Edges Layer  (EdgesLayer — committed edges, listening:true)
//   - EdgeDraft Layer (this PR, listening:false — ghost only)
//   - Nodes Layer  (TextNodeCard + per-node Group{ AnchorDots })
//   - Origin Layer (listening:false, debug crosshair stays visible)
//
// Origin stays on top so a card placed at (0,0) doesn't hide the debug
// marker; we want to see "is this where I think it is?" through the card.

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
  // Phase 2 PR 2 interactions: keyboard Delete/Backspace + double-click-empty
  // creates a card. Both hooks are mounted once; they read store state via
  // getState() so they don't subscribe to per-keystroke re-renders.
  useDeleteKey();
  const create = useCreate();
  // Phase 3 PR 2: drag-from-anchor → new edge. Composed with usePan in
  // onStageMouseDown — anchor mousedown short-circuits pan.
  const draw = useDrawEdge();

  // Compose wheel: zoom owns ctrl/meta+wheel, pan owns plain wheel.
  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    if (zoomI.onWheel(e)) return;
    pan.onWheel(e);
  };

  // Stage-level mousedown: anchor-dot hit-test runs first. If we claimed
  // the gesture (drag-to-connect), don't also start a pan / clear
  // selection. Otherwise fall through to pan + empty-canvas-click logic.
  const onStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (draw.onMouseDown(e)) return;
    // Pan starts on mousedown too; let it run first so it can claim the
    // event for middle-click / space-drag. usePan only acts on the
    // relevant button so calling it here is safe.
    pan.onMouseDown(e);
    if (e.target === e.target.getStage()) {
      useSelection.getState().clear();
    }
  };

  const onStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    draw.onMouseMove(e);
    pan.onMouseMove(e);
  };

  const onStageMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    draw.onMouseUp(e);
    pan.onMouseUp(e);
  };

  const onStageMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
    // If a draft was in flight when the cursor leaves the stage, drop it —
    // mouseup outside the window won't reach us, and a "stuck" ghost would
    // be confusing.
    draw.cancel();
    pan.onMouseLeave(e);
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
      onMouseMove={onStageMouseMove}
      onMouseUp={onStageMouseUp}
      onMouseLeave={onStageMouseLeave}
      onWheel={onWheel}
      onDblClick={create.onDblClick}
      onDblTap={create.onDblClick}
    >
      {gridVisible ? (
        <Layer listening={false}>
          <Grid />
        </Layer>
      ) : null}
      <EdgesLayer />
      <Layer listening={false} name="edge-draft">
        <EdgeDraft />
      </Layer>
      <Layer>
        {nodes.map((n) => {
          const selected = Boolean(selectionIds[n.id]);
          return (
            <Fragment key={n.id}>
              <TextNodeCard
                node={n}
                selected={selected}
                onSelect={() => {
                  // Single-select for Phase 2. Phase 4 will read modifier
                  // keys off the event and call `select(id, true)` on
                  // Shift+click.
                  useSelection.getState().select(n.id);
                }}
              />
              {/* AnchorDots use local coords (positions returned by
                  geometry.anchorPosition are relative to {0,0,width,height}),
                  so we wrap them in a Group at the node's canvas position.
                  Rendered AFTER the TextNode so the dots visually sit
                  above the card. Per the plan, anchors show on hover or
                  when the card is selected; for now we force them on
                  while selected — Phase 3 PR 3 (sibling C) may add hover
                  affordance via Konva enter/leave on the card Group. */}
              <Group x={n.x} y={n.y}>
                <AnchorDots node={n} visible={selected} />
              </Group>
            </Fragment>
          );
        })}
      </Layer>
      <Layer listening={false}>
        <Origin />
      </Layer>
    </Stage>
  );
}

export default Canvas;
