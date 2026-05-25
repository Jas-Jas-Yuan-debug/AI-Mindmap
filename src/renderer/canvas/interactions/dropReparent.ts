// Store-aware glue for "drop a node onto / out of a group" (Phase 6 sibling
// subagent B). Bridges the pure geometry in `groupHitTest.ts` to the store
// action `setParent` from `reparent.ts`.
//
// Kept separate from GroupNode.tsx / TextNode.tsx so BOTH renderers (a text
// card AND a group, since a group can be dropped into another group) share
// one code path, and so the decision logic is testable without Konva.
//
// History is the CALLER's responsibility: the drag handlers already call
// `useHistory.capture()` on drag START, so the whole gesture (move + reparent
// on drop) collapses into one undo step. We deliberately do NOT capture here.

import { useNodes } from "../../store/nodes.js";
import { descendantsOf, setParent } from "../../store/reparent.js";
import {
  groupDropTarget,
  type GroupCandidate,
} from "./groupHitTest.js";

/**
 * After a node finishes dragging, decide its new parent and apply it.
 *
 * Reads the live store for the dragged node's current geometry and every
 * group's bounds, hit-tests the dragged node's center against the groups
 * (excluding itself + its own descendants so a group can't be dropped into
 * its own subtree), and:
 *   - lands inside a group it isn't already parented to → `setParent(id, gid)`
 *   - lands over empty canvas while previously parented → `setParent(id, null)`
 *   - lands in its current parent (or stays top-level) → no-op
 *
 * Returns the resulting parent id (or `null` for top-level), or `undefined`
 * if the node id is unknown / nothing changed semantically. The store's cycle
 * guard in `setParent` is the backstop against illegal reparents.
 */
export function reparentOnDrop(nodeId: string): string | null | undefined {
  const nodes = useNodes.getState().nodes;
  const dragged = nodes.find((n) => n.id === nodeId);
  if (!dragged) return undefined;

  // Build the exclude set: the node itself plus its whole subtree, so a group
  // never targets itself or one of its own descendants (would be a cycle).
  const exclude = new Set<string>([nodeId]);
  for (const d of descendantsOf(nodes, nodeId)) exclude.add(d.id);

  const candidates: GroupCandidate[] = nodes
    .filter((n) => n.type === "group")
    .map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }));

  const targetId = groupDropTarget(
    { x: dragged.x, y: dragged.y, width: dragged.width, height: dragged.height },
    candidates,
    exclude,
  );

  const currentParent = dragged.parentId ?? null;
  if (targetId === currentParent) return currentParent; // no change

  if (targetId === null) {
    setParent(nodeId, null);
    return null;
  }
  setParent(nodeId, targetId);
  return targetId;
}
