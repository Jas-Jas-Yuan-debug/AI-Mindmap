import { Fragment, useEffect, useRef, useState } from "react";
import { Group, Layer, Stage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useViewport } from "../store/viewport.js";
import { useSettings } from "../store/settings.js";
import { useNodes } from "../store/nodes.js";
import {
  depthOf as groupDepth,
  isHiddenByCollapsedAncestor,
} from "../store/reparent.js";
import { useSelection } from "../store/selection.js";
import { useEdgeSelection } from "../store/edgeSelection.js";
import { Grid } from "./Grid.js";
import { Origin } from "./Origin.js";
import { LassoLayer } from "./LassoLayer.js";
import { TextNodeCard } from "./nodes/TextNode.js";
import { GroupNodeBox } from "./nodes/GroupNode.js";
import { ImageNodeBox } from "./nodes/ImageNode.js";
import { FileNodeBox } from "./nodes/FileNode.js";
import { LinkNodeBox } from "./nodes/LinkNode.js";
import { AnchorDots } from "./nodes/AnchorDots.js";
import { EdgesLayer } from "./edges/EdgesLayer.js";
import { EdgeDraft } from "./edges/EdgeDraft.js";
import { EdgeHitLayer } from "./edges/EdgeHitLayer.js";
import { EdgeSelectionHighlight } from "./edges/EdgeSelectionHighlight.js";
import { useDrawEdge } from "./edges/useDrawEdge.js";
import { usePan } from "./interactions/usePan.js";
import { useZoom } from "./interactions/useZoom.js";
import { useDeleteKey } from "./interactions/useDeleteKey.js";
import { useHistoryKeys } from "./interactions/useHistoryKeys.js";
import { useClipboardKeys } from "./interactions/useClipboardKeys.js";
import { useFileKeys } from "./interactions/useFileKeys.js";
import { useCreate } from "./interactions/useCreate.js";
import { useLasso } from "./interactions/useLasso.js";
import { useSelectAllKey } from "./interactions/useSelectAllKey.js";
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
//   - Nodes Layer       (group containers, THEN TextNodeCard + AnchorDots)
//   - Origin Layer      (listening:false, debug crosshair on top)
//
// Phase 6 (sibling A) z-order: within the Nodes Layer we render group
// containers in a FIRST pass and non-group nodes in a SECOND pass, so a group
// always sits BEHIND its children (plan §6 Phase 6: "groups always render
// behind their children"). We chose a stable two-pass render over re-sorting
// the store array because it (a) keeps the store's array order — which IS the
// document z-order per plan §5 "z-order is array order" — untouched, and (b)
// preserves relative order WITHIN each pass. Full nested-group inter-leaving
// (a child group above its parent but below an unrelated top-level node) is
// sibling B's refinement; groups-behind-everything-else is the foundation.

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

  // Phase 6 (sibling C) collapse: a collapsed group hides its whole subtree.
  // We filter the rendered set so hidden descendants neither paint NOR
  // hit-test (they're simply not in the Konva tree). The collapsed group
  // itself stays visible (it shows its child count in the header). Computed
  // here once per render so both passes share the same visibility decision.
  const visibleNodes = nodes.filter(
    (n) => !isHiddenByCollapsedAncestor(nodes, n.id),
  );

  // Stage ref — needed by useEdgeContextMenu so it can attach a DOM
  // listener to the Konva container and call `Stage.getIntersection`.
  const stageRef = useRef<Konva.Stage | null>(null);

  const pan = usePan();
  const zoomI = useZoom();
  useDeleteKey();
  // Phase 4 PR 1: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y redo.
  useHistoryKeys();
  // Phase 4 PR 2: Cmd/Ctrl+A select-all (document-level keydown).
  useSelectAllKey();
  // Phase 4 PR 2: lasso/marquee selection on empty-canvas drag.
  const lasso = useLasso();
  // Phase 4 PR 3 (sibling C): Cmd/Ctrl + C / X / V in-app clipboard.
  useClipboardKeys();
  // Phase 5 PR 2 (this PR): Cmd/Ctrl + N/O/S/Shift+S file menu shortcuts.
  useFileKeys();
  const create = useCreate();
  // Phase 3 PR 2: drag-from-anchor → new edge. Composed with usePan in
  // onStageMouseDown — anchor mousedown short-circuits pan.
  const draw = useDrawEdge();
  // Phase 3 PR 3: edge click selection + right-click color picker.
  const edgeSelect = useEdgeSelectClick();
  useEdgeContextMenu(stageRef);

  // Shared select-on-pointer-down used by both passes of the Nodes Layer
  // (group containers + text cards). Phase 4 semantics: Shift toggles into a
  // multi-selection; a plain click single-selects (replacing the prior
  // selection). The drag handlers in TextNode/GroupNode also single-select an
  // unselected node on drag-start, so a shift-click that ADDS a node still
  // lets a subsequent group-move drag carry the whole set.
  const selectNode = (id: string, shift: boolean) => {
    if (shift) useSelection.getState().toggle(id);
    else useSelection.getState().select(id);
  };

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
    // Phase 4: lasso owns empty-canvas single-click-drag (no space held).
    // When it claims the gesture we skip pan AND the empty-canvas clear —
    // the lasso's mouseup sets the resulting selection (and clears it if the
    // marquee caught nothing). Pan still owns space-held drags because the
    // lasso bails when spacebar is down.
    if (lasso.onMouseDown(e)) {
      // Still drop edge selection so a marquee on empty canvas resets the
      // edge focus, matching the previous empty-mousedown behaviour.
      useEdgeSelection.getState().clear();
      return;
    }
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
    lasso.onMouseMove(e);
    pan.onMouseMove(e);
  };

  const onStageMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    draw.onMouseUp(e);
    lasso.onMouseUp(e);
    pan.onMouseUp(e);
  };

  const onStageMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
    // If a draft was in flight when the cursor leaves the stage, drop it —
    // mouseup outside the window won't reach us, and a "stuck" ghost would
    // be confusing.
    draw.cancel();
    // Commit (and clear) any in-flight lasso on leave for the same reason.
    lasso.onMouseUp(e);
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
        {/* Pass 1 (BEHIND): group containers. Rendered first so children in
            pass 2 always paint on top of their group. Phase 6 (sibling B):
            within this pass, sort by nesting DEPTH (ancestors first) so a
            nested child group paints ON TOP of its parent group — its tint /
            border / label stay visible. Text nodes still paint above ALL
            groups (pass 2), so deepening the group order never hides a card.
            Stable: equal-depth groups keep store-array (z-order) order. */}
        {visibleNodes
          .filter((n) => n.type === "group")
          .map((n) => ({ n, depth: groupDepth(nodes, n.id) }))
          .sort((a, b) => a.depth - b.depth)
          .map(({ n }) => {
            const selected = Boolean(selectionIds[n.id]);
            return (
              <GroupNodeBox
                key={n.id}
                node={n}
                selected={selected}
                onSelect={(e) => selectNode(n.id, e.evt.shiftKey)}
              />
            );
          })}
        {/* Pass 2 (ON TOP): non-group nodes (text cards today; file/link/
            image join in Phase 7). */}
        {visibleNodes
          .filter((n) => n.type === "text")
          .map((n) => {
            const selected = Boolean(selectionIds[n.id]);
            return (
              <Fragment key={n.id}>
                <TextNodeCard
                  node={n}
                  selected={selected}
                  onSelect={(e) => selectNode(n.id, e.evt.shiftKey)}
                />
                {/* AnchorDots use local coords (positions returned by
                    geometry.anchorPosition are relative to {0,0,width,
                    height}), so we wrap them in a Group at the node's canvas
                    position. Rendered AFTER the TextNode so the dots visually
                    sit above the card. */}
                <Group x={n.x} y={n.y}>
                  <AnchorDots node={n} visible={selected} />
                </Group>
              </Fragment>
            );
          })}
        {/* Pass 2b (Phase 7): embed nodes — image / file / link. Rendered in
            the same on-top pass as text cards (above all groups). Each is
            draggable + selectable via the shared useNodeDrag hook. */}
        {visibleNodes
          .filter(
            (n) => n.type === "image" || n.type === "file" || n.type === "link",
          )
          .map((n) => {
            const selected = Boolean(selectionIds[n.id]);
            const onNodeSelect = (e: KonvaEventObject<MouseEvent>) =>
              selectNode(n.id, e.evt.shiftKey);
            if (n.type === "image") {
              return (
                <ImageNodeBox key={n.id} node={n} selected={selected} onSelect={onNodeSelect} />
              );
            }
            if (n.type === "file") {
              return (
                <FileNodeBox key={n.id} node={n} selected={selected} onSelect={onNodeSelect} />
              );
            }
            return (
              <LinkNodeBox key={n.id} node={n} selected={selected} onSelect={onNodeSelect} />
            );
          })}
      </Layer>
      <Layer listening={false}>
        <Origin />
      </Layer>
      {/* Phase 4: lasso marquee drawn on top of everything, in canvas
          coords (inside the Stage transform) so it pans + scales with the
          content. listening={false} so it never steals pointer events. */}
      <Layer listening={false} name="lasso">
        <LassoLayer rect={lasso.rect} />
      </Layer>
    </Stage>
  );
}

export default Canvas;
