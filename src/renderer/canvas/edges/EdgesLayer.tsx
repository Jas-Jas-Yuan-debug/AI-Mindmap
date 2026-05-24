// The Konva Layer that renders every Edge. Mounted by `Canvas.tsx`
// between the Grid layer and the Nodes layer so edges visually sit
// UNDER nodes (matches Excalidraw's mental model — arrows pass behind
// cards, not in front).
//
// Sibling C will:
//   - Drive per-edge `selected` from the selection store (right now
//     every Edge renders with `selected={false}`).
//   - Wire pointer events on the Edge group for click-to-select.

import { Layer } from "react-konva";
import { useEdges } from "../../store/edges.js";
import { Edge } from "./Edge.js";

export function EdgesLayer() {
  // Subscribe to the edges array. Adding / removing an edge re-renders
  // the layer; per-edge prop changes (the node that an edge points at
  // moving) come from each `<Edge>`'s own `useNodes` subscription, so
  // a node move doesn't churn this list at all.
  const edges = useEdges((s) => s.edges);
  return (
    <Layer>
      {edges.map((e) => (
        <Edge key={e.id} edge={e} selected={false} />
      ))}
    </Layer>
  );
}

export default EdgesLayer;
