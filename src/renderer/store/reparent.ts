// Reparenting primitives + cycle prevention for group containers (Phase 6
// foundation — sibling subagent A).
//
// Groups form a tree via each node's `parentId` (a node's parent is the
// GroupNode whose id equals that node's `parentId`; a node with no `parentId`
// is at the top level). These helpers are the shared vocabulary the rest of
// Phase 6 builds on:
//
//   - Sibling B (drag in/out + group move): calls `setParent` on drop, reads
//     `childrenOf` when moving a group so all children follow.
//   - Sibling C (collapse + save/load + undo): reads `descendantsOf` to hide a
//     collapsed group's subtree, and relies on `wouldCreateCycle` staying the
//     single source of truth for "is this reparent legal".
//
// Most functions are PURE over an array of nodes (no store access) so they're
// trivially unit-testable. The one store action, `setParent`, is the only
// piece that mutates — and it refuses any reparent that would create a cycle.
//
// Cycle definition (plan §6 Phase 6 exit criterion): you cannot make A a child
// of B if B is A, or if B is already somewhere inside A's subtree. Allowing it
// would create a parentId loop that walks forever.

import {
  type AimapNode,
  useNodes,
} from "./nodes.js";

/**
 * Walk `nodeId`'s ancestor chain (following `parentId`) and report whether
 * `candidateAncestorId` appears in it.
 *
 * Returns `false` when `nodeId === candidateAncestorId` — a node is not its
 * own ancestor (use `wouldCreateCycle` for the self check). Robust against a
 * pre-existing malformed loop in the data: a `seen` set bounds the walk so a
 * corrupt file can't hang the renderer.
 */
export function isDescendant(
  nodes: readonly AimapNode[],
  candidateAncestorId: string,
  nodeId: string,
): boolean {
  if (candidateAncestorId === nodeId) return false;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let current = byId.get(nodeId)?.parentId;
  while (current !== undefined) {
    if (current === candidateAncestorId) return true;
    if (seen.has(current)) break; // defensive: pre-existing loop, bail
    seen.add(current);
    current = byId.get(current)?.parentId;
  }
  return false;
}

/**
 * Would making `childId` a child of `newParentId` create a cycle?
 *
 * True when:
 *   - `newParentId === childId` (a node can't parent itself), OR
 *   - `newParentId` is a descendant of `childId` (parenting under your own
 *     subtree forms a loop).
 *
 * This is the single guard `setParent` consults; sibling B/C must route every
 * reparent through `setParent` (not raw `updateNode({ parentId })`) so the
 * check can never be bypassed.
 */
export function wouldCreateCycle(
  nodes: readonly AimapNode[],
  childId: string,
  newParentId: string,
): boolean {
  if (newParentId === childId) return true;
  // newParentId sits inside childId's subtree ⟺ newParentId is a descendant
  // of childId ⟺ childId is an ancestor of newParentId.
  return isDescendant(nodes, childId, newParentId);
}

/**
 * Direct children of `groupId`: every node whose `parentId === groupId`.
 * Order follows the store's node array order (z-order). Does NOT recurse —
 * use `descendantsOf` for the full subtree.
 */
export function childrenOf(
  nodes: readonly AimapNode[],
  groupId: string,
): AimapNode[] {
  return nodes.filter((n) => n.parentId === groupId);
}

/**
 * Every node in `groupId`'s subtree (children, grandchildren, …), excluding
 * the group itself. Iterative breadth-first walk with a `seen` guard so a
 * malformed loop in the data can't spin forever.
 */
export function descendantsOf(
  nodes: readonly AimapNode[],
  groupId: string,
): AimapNode[] {
  // Index children by parentId once so the walk is O(n) rather than O(n²).
  const childrenByParent = new Map<string, AimapNode[]>();
  for (const n of nodes) {
    if (n.parentId === undefined) continue;
    const bucket = childrenByParent.get(n.parentId);
    if (bucket) bucket.push(n);
    else childrenByParent.set(n.parentId, [n]);
  }

  const out: AimapNode[] = [];
  const seen = new Set<string>([groupId]);
  const queue: string[] = [groupId];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    const kids = childrenByParent.get(parent);
    if (!kids) continue;
    for (const kid of kids) {
      if (seen.has(kid.id)) continue; // defensive against loops
      seen.add(kid.id);
      out.push(kid);
      queue.push(kid.id);
    }
  }
  return out;
}

/**
 * Nesting depth of `nodeId`: the number of ancestors above it (0 for a
 * top-level node, 1 for a direct child of a top-level group, …). Walks the
 * `parentId` chain with a `seen` guard so a malformed loop can't hang. Added
 * by Phase 6 sibling B for the Canvas z-order pass — rendering groups in
 * ascending-depth order keeps a nested child group painted on top of its
 * parent.
 */
export function depthOf(
  nodes: readonly AimapNode[],
  nodeId: string,
): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([nodeId]);
  let depth = 0;
  let current = byId.get(nodeId)?.parentId;
  while (current !== undefined) {
    if (seen.has(current)) break; // defensive: pre-existing loop, bail
    seen.add(current);
    depth += 1;
    current = byId.get(current)?.parentId;
  }
  return depth;
}

/**
 * Set (or clear) a node's parent. Pass `null` to detach the node to the top
 * level. Returns `true` if the change was applied, `false` if it was refused
 * because it would create a cycle (the store is left untouched on refusal).
 *
 * This is the ONLY sanctioned way to change `parentId`. Sibling B's drag-in /
 * drag-out and sibling C's load path should call this so the cycle guard can
 * never be bypassed. History capture is the CALLER's responsibility (wrap in
 * `useHistory.transact`/`capture`) so a reparent can be grouped with the
 * move/drop that triggered it into one undo step.
 */
export function setParent(childId: string, parentId: string | null): boolean {
  const nodes = useNodes.getState().nodes;
  const child = nodes.find((n) => n.id === childId);
  // Unknown child id: no-op, treated as "not applied".
  if (!child) return false;

  if (parentId === null) {
    // Detaching is always safe (can't create a cycle by removing an edge).
    // No-op if already top-level.
    if (child.parentId === undefined) return true;
    // We strip the `parentId` key entirely rather than set it to `undefined`,
    // because `updateNode`'s shallow merge + `exactOptionalPropertyTypes`
    // won't accept `{ parentId: undefined }`. Rebuild the node without the key
    // so serialization (sibling C) never writes a `parentId: undefined`.
    useNodes.setState((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== childId) return n;
        const { parentId: _drop, ...rest } = n;
        void _drop;
        return rest as AimapNode;
      }),
    }));
    return true;
  }

  // Reparenting under an unknown group id is refused (defensive).
  if (!nodes.some((n) => n.id === parentId)) return false;

  if (wouldCreateCycle(nodes, childId, parentId)) return false;

  // No-op if already the parent.
  if (child.parentId === parentId) return true;

  useNodes.getState().updateNode(childId, { parentId });
  return true;
}
