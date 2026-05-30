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
  makeGroupId,
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
 * Is `nodeId` hidden because one of its ANCESTOR groups is collapsed?
 *
 * Phase 6 collapse (sibling C): a collapsed group hides its entire subtree
 * (children, grandchildren, …). We walk `nodeId`'s `parentId` chain and return
 * `true` the moment we hit any ancestor group with `collapsed === true`. The
 * node's OWN `collapsed` flag does NOT hide it (a collapsed group still draws
 * its own header + child count) — only an ANCESTOR being collapsed hides it.
 *
 * Pure over the node array (no store access) so it's trivially unit-testable
 * and reusable as a Canvas render filter. A `seen` set bounds the walk so a
 * malformed parentId loop in a corrupt file can't hang the renderer.
 */
export function isHiddenByCollapsedAncestor(
  nodes: readonly AimapNode[],
  nodeId: string,
): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([nodeId]);
  let current = byId.get(nodeId)?.parentId;
  while (current !== undefined) {
    if (seen.has(current)) break; // defensive: pre-existing loop, bail
    seen.add(current);
    const ancestor = byId.get(current);
    if (ancestor === undefined) break; // dangling parentId, treat as visible
    if (ancestor.type === "group" && ancestor.collapsed === true) return true;
    current = ancestor.parentId;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Phase 6 grouping helpers (S4 — Cmd/Ctrl+G / Cmd/Ctrl+Shift+G)
// ---------------------------------------------------------------------------

/** Padding around the member bboxes inside a newly-created group container. */
const GROUP_PAD = 24;
/** Height reserved above the member area for the group's header bar. */
const GROUP_HEADER = 28;

/**
 * Topmost GROUP ancestor of `id` (walk the `parentId` chain upward and return
 * the OUTERMOST ancestor whose `type === "group"`), or null if the node is not
 * nested inside any group.
 *
 * A `seen` set guards against pre-existing malformed loops so the walk always
 * terminates. The LAST (outermost) group ancestor found is returned, which is
 * what the Canvas uses to lift a selection to the top-most groupable unit.
 */
export function topGroupOf(
  nodes: readonly AimapNode[],
  id: string,
): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([id]);
  let current = byId.get(id)?.parentId;
  let outermost: string | null = null;
  while (current !== undefined) {
    if (seen.has(current)) break; // defensive: pre-existing loop
    seen.add(current);
    const ancestor = byId.get(current);
    if (ancestor === undefined) break; // dangling parentId
    if (ancestor.type === "group") outermost = ancestor.id;
    current = ancestor.parentId;
  }
  return outermost;
}

/**
 * The GROUP ancestors of `id`, ordered OUTERMOST → innermost (the node itself
 * is NOT included). For a tree `outer > inner > leaf`, calling on `leaf`
 * returns `[outer, inner]`; on `inner` returns `[outer]`; on a top-level node
 * returns `[]`.
 *
 * The Canvas uses this to drive Excalidraw-style step-down selection: a click
 * selects the outermost group first, and each subsequent click on the same
 * spot drills one level deeper (outer → inner → leaf) instead of jumping
 * straight to the leaf. A `seen` set guards malformed parentId loops.
 */
export function groupAncestorsOf(
  nodes: readonly AimapNode[],
  id: string,
): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([id]);
  const innermostFirst: string[] = [];
  let current = byId.get(id)?.parentId;
  while (current !== undefined) {
    if (seen.has(current)) break; // defensive: pre-existing loop
    seen.add(current);
    const ancestor = byId.get(current);
    if (ancestor === undefined) break; // dangling parentId
    if (ancestor.type === "group") innermostFirst.push(ancestor.id);
    current = ancestor.parentId;
  }
  return innermostFirst.reverse(); // outermost first
}

/**
 * Group the given node ids into a NEW GroupNode container sized to fit tightly
 * around them (plus GROUP_PAD + GROUP_HEADER). Returns the new group's id, or
 * null if fewer than 2 valid node ids are provided.
 *
 * History capture is the CALLER's responsibility — call
 * `useHistory.getState().capture()` BEFORE invoking this function.
 *
 * `addNode` is called before `setParent` so the parent exists when the child
 * is reparented (setParent refuses an unknown parent id).
 */
export function groupSelection(ids: readonly string[]): string | null {
  const nodes = useNodes.getState().nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const valid = ids.filter((id) => byId.has(id));
  if (valid.length < 2) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of valid) {
    const n = byId.get(id)!;
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }

  const gid = makeGroupId();
  const group: AimapNode = {
    id: gid,
    type: "group" as const,
    x: Math.round(minX - GROUP_PAD),
    y: Math.round(minY - GROUP_PAD - GROUP_HEADER),
    width: Math.round((maxX - minX) + GROUP_PAD * 2),
    height: Math.round((maxY - minY) + GROUP_PAD * 2 + GROUP_HEADER),
    label: "Group",
  };
  useNodes.getState().addNode(group);
  for (const id of valid) {
    setParent(id, gid);
  }
  return gid;
}

/**
 * Ungroup: for each id in `ids` that is a GroupNode, lift its direct children
 * to the group's OWN parent (preserving outer nesting) and delete the group.
 * Returns the ids of all freed children (for the caller to re-select).
 *
 * History capture is the CALLER's responsibility — call
 * `useHistory.getState().capture()` BEFORE invoking this function.
 *
 * `useNodes.getState().nodes` is re-read per group iteration so changes from
 * earlier iterations are visible when processing subsequent groups.
 */
export function ungroupSelection(ids: readonly string[]): string[] {
  const freed: string[] = [];
  for (const id of ids) {
    // Re-read the store each iteration so earlier deletions are reflected.
    const nodes = useNodes.getState().nodes;
    const group = nodes.find((n) => n.id === id);
    if (!group || group.type !== "group") continue;
    const groupParent = group.parentId ?? null;
    const kids = childrenOf(nodes, id);
    for (const kid of kids) {
      setParent(kid.id, groupParent);
      freed.push(kid.id);
    }
    useNodes.getState().deleteNode(id);
  }
  return freed;
}

// ---------------------------------------------------------------------------
// setParent
// ---------------------------------------------------------------------------

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
