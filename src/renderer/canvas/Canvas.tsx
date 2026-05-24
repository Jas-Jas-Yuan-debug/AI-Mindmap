import { Fragment, useEffect, useRef, useState } from "react";
import { Group, Layer, Stage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useViewport } from "../store/viewport.js";
import { useSettings } from "../store/settings.js";
import { useNodes } from "../store/nodes.js";
import { useSelection } from "../store/selection.js";
import { useEdgeSelection } from "../store/edgeSelection.js";
import { Grid } from "./Grid.js";
import { Origin } from "./Origin.js";
import { TextNodeCard } from "./nodes/TextNode.js";
import { AnchorDots } from "./nodes/AnchorDots.js";
import { EdgesLayer } from "./edges/EdgesLayer.js";
import { EdgeDraft } from "./edges/EdgeDraft.js";
import { EdgeHitLayer } from "./edges/EdgeHitLayer.js";
import { EdgeSelectionHighlight } from "./edges/EdgeSelectionHighlight.js";
import { useDrawEdge } from "./edges/useDrawEdge.js";
import { usePan } from "./interactions/usePan.js";
import { useZoom } from "./interactions/useZoom.js";
import { useDeleteKey } from "./interactions/useDeleteKey.js";
import { useCreate } from "./interactions/useCreate.js";
import { useEdgeSelectClick } from "./interactions/useEdgeSelectClick.js";
import { useEdgeContextMenu } from "./interactions/useEdgeContextMenu.js";

// The viewport-driven Konva Stage. Owns its own size (responsive to window
// resize) and reads pan/zoom from the Zustand viewport store.
//
// Phase 2 PR 1 added a Nodes layer between the Grid and the Origin.
// Phase 3 PR 1 (sibling A) inserts the Edges layer UNDER the Nodes layer
// so arrows pass behind cards (matches Excalidraw's mental model).
// Phase 3 PR 2 (sibling B) adds AnchorDots per TextNode + EdgeDraft
// (ghost during drag-to-connect) + useDrawEdge() composed with usePan.
// Phase 3 PR 3 (this PR) adds:
//   - EdgeHitLayer: transparent, wider-stroked, listening hit targets
//     for committed edges. A's <Edge>'s visible Path is non-listening
//     (so edges never steal pan / drag from empty canvas); without this
//     overlay edges would be un-clickable. Stamped name="aim-edge" + id.
//   - EdgeSelectionHighlight: purple overlay drawn on top of EdgesLayer
//     for the currently-selected edge (listening:false).
//   - useEdgeSelectClick: Stage onClick handler that walks the target's
//     ancestor chain for `name="aim-edge"` and selects.
//   - useEdgeContextMenu: container contextmenu listener that uses
//     Stage.getIntersection to detect edges and open the ColorPicker.
//
// Layer order (back → front):
//   - Grid Layer        (listening:false, only when gridVisible)
//   - Edges Layer       (committed edges, listening:true via EdgeHitLayer)
//   - Edge Hit Layer    (this PR, transparent hit targets, listening:true)
//   - Edge Draft Layer  (PR 2, ghost edge, listening:false)
//   - Edge Selection Highlight (this PR, focus overlay, listening:false)
//   - Nodes Layer       (TextNodeCard + per-node Group{ AnchorDots })
//   - Origin Layer      (listening:false, debug crosshair on top)

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
  const selectionIds = useSelection((s) => s.ids);

  // Stage ref — needed by useEdgeContextMenu so it can attach a DOM
  // listener to the Konva container and call `Stage.getIntersection`.
  const stageRef = useRef<Konva.Stage | null>(null);

  const pan = usePan();
  const zoomI = useZoom();
  useDeleteKey();
  const create = useCreate();
  // Phase 3 PR 2: drag-from-anchor → new edge. Composed with usePan in
  // onStageMouseDown — anchor mousedown short-circuits pan.
  const draw = useDrawEdge();
  // Phase 3 PR 3: edge click selection + right-click color picker.
  const edgeSelect = useEdgeSelectClick();
  useEdgeContextMenu(stageRef);

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
    pan.onMouseDown(e);
    if (e.target === e.target.getStage()) {
      useSelection.getState().clear();
      // Empty-canvas mousedown also drops any edge selection so a stray
      // click on the background "resets" the focus state cleanly. The
      // onClick handler below will re-do this for any non-edge target —
      // harmless double-clear.
      useEdgeSelection.getState().clear();
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
      ref={stageRef}
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
      onClick={edgeSelect.onClick}
      onTap={edgeSelect.onClick}
      onDblClick={create.onDblClick}
      onDblTap={create.onDblClick}
    >
      {gridVisible ? (
        <Layer listening={false}>
          <Grid />
        </Layer>
      ) : null}
      <EdgesLayer />
      <EdgeHitLayer />
      <Layer listening={false} name="edge-draft">
        <EdgeDraft />
      </Layer>
      <EdgeSelectionHighlight />
      <Layer>
        {nodes.map((n) => {
          const selected = Boolean(selectionIds[n.id]);
          return (
            <Fragment key={n.id}>
              <TextNodeCard
                node={n}
                selected={selected}
                onSelect={() => {
                  useSelection.getState().select(n.id);
                }}
              />
              {/* AnchorDots use local coords (positions returned by
                  geometry.anchorPosition are relative to {0,0,width,height}),
                  so we wrap them in a Group at the node's canvas position.
                  Rendered AFTER the TextNode so the dots visually sit
                  above the card. */}
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
