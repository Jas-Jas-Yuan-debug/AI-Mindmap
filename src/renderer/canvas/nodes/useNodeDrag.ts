// Shared group-move + reparent drag behaviour for the Phase 7 embed nodes
// (image / file / link). Mirrors the inline logic in TextNode.tsx so all
// node kinds drag identically: one undo step per gesture, multi-selection
// moves together, single-node drops reparent into the group under the cursor.
//
// TextNode keeps its own inline copy (it predates this hook and also owns
// resize handles); this hook serves the simpler embed renderers without
// duplicating ~60 lines three times.

import { useRef } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { useNodes } from "../../store/nodes.js";
import { useSelection } from "../../store/selection.js";
import { useHistory } from "../../store/history.js";
import { reparentOnDrop } from "../interactions/dropReparent.js";

export function useNodeDrag(nodeId: string) {
  const dragRef = useRef<{
    originX: number;
    originY: number;
    peers: { id: string; x: number; y: number }[];
  } | null>(null);

  const onDragStart = (e: KonvaEventObject<DragEvent>) => {
    useHistory.getState().capture();
    const sel = useSelection.getState();
    let peerIds: string[];
    if (!sel.isSelected(nodeId)) {
      sel.select(nodeId);
      peerIds = [];
    } else {
      peerIds = Object.keys(sel.ids).filter((id) => id !== nodeId);
    }
    const live = useNodes.getState().nodes;
    const peers = peerIds
      .map((id) => {
        const n = live.find((nn) => nn.id === id);
        return n ? { id, x: n.x, y: n.y } : null;
      })
      .filter((p): p is { id: string; x: number; y: number } => p !== null);
    dragRef.current = { originX: e.target.x(), originY: e.target.y(), peers };
  };

  const onDragMove = (e: KonvaEventObject<DragEvent>) => {
    const x = Math.round(e.target.x());
    const y = Math.round(e.target.y());
    useNodes.getState().moveNode(nodeId, x, y);
    const g = dragRef.current;
    if (g && g.peers.length > 0) {
      const dx = e.target.x() - g.originX;
      const dy = e.target.y() - g.originY;
      const move = useNodes.getState().moveNode;
      for (const p of g.peers) {
        move(p.id, Math.round(p.x + dx), Math.round(p.y + dy));
      }
    }
  };

  const onDragEnd = () => {
    if (!dragRef.current || dragRef.current.peers.length === 0) {
      reparentOnDrop(nodeId);
    }
    dragRef.current = null;
  };

  return { onDragStart, onDragMove, onDragEnd };
}
