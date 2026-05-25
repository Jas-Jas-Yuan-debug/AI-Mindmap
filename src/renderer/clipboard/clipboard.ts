// In-app clipboard for cut / copy / paste of node+edge subgraphs.
//
// Phase 4 (PR 3/3, sibling subagent C). This module is the pure-ish core of
// the clipboard feature: the keyboard wiring lives in
// `../canvas/interactions/useClipboardKeys.ts`, which calls into here.
//
// Design:
//   - The clipboard itself is an in-app, module-level variable. It is NOT
//     the OS clipboard — we deliberately keep a private in-memory payload so
//     we can round-trip the full node + edge structure (the OS clipboard
//     only carries text/HTML/image flavours, which would lose our graph
//     shape). Plan §6 Phase 4 specifies an "internal JSON clipboard".
//   - `copySelection` reads the current node selection, collects those
//     nodes plus every edge whose BOTH endpoints are selected (internal
//     edges only — a dangling edge to an unselected node is dropped, since
//     pasting it would reference a node that isn't part of the payload).
//   - `pasteClipboard` mints fresh ids for every node and edge, offsets the
//     node positions, remaps edge endpoints through an old→new id map, and
//     writes them into the stores. It then selects the freshly-pasted nodes
//     so the user can immediately move/style them.
//   - The id-remap logic is factored into the pure `remapSubgraph` helper
//     so it is trivially unit-testable without touching any store.
//
// Undo grouping: paste and cut are wrapped in `useHistory.transact(...)` by
// the keyboard hook (NOT here) so each is a single undo step. This module
// only performs the raw store writes; it does not know about history.

import {
  type AimapNode,
  makeNodeId,
  useNodes,
} from "../store/nodes.js";
import { type Edge, makeEdgeId, useEdges } from "../store/edges.js";
import { useSelection } from "../store/selection.js";

/**
 * A self-contained subgraph: a set of nodes plus the edges that are
 * internal to that set (both endpoints present). This is the unit the
 * clipboard holds and that paste reconstructs.
 */
export interface ClipboardPayload {
  nodes: AimapNode[];
  edges: Edge[];
}

/** Default paste nudge, in canvas units. See `pasteClipboard`. */
export const PASTE_OFFSET = { dx: 20, dy: 20 } as const;

/**
 * The in-app clipboard. Module-level so it survives across keystrokes but
 * is scoped to the renderer session (not persisted, not the OS clipboard).
 * `null` when nothing has been copied/cut yet.
 */
let clipboard: ClipboardPayload | null = null;

/** Test seam: read the current clipboard payload (or null). */
export function getClipboard(): ClipboardPayload | null {
  return clipboard;
}

/** Test seam: reset the clipboard. Used by unit tests between cases. */
export function clearClipboard(): void {
  clipboard = null;
}

/**
 * Deep-clone a node. Nodes are flat data records (no functions, no nested
 * refs we share), so structuredClone — falling back to JSON round-trip for
 * older runtimes — is sufficient and keeps the clipboard immune to later
 * mutations of the live store objects.
 */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Copy the current node selection into the in-app clipboard.
 *
 * Collects the selected nodes and every edge whose `fromNode` AND `toNode`
 * are both in the selection (internal edges). Edges with one endpoint
 * outside the selection are dropped — pasting them would dangle.
 *
 * Returns the payload that was stored, or `null` if nothing is selected
 * (in which case the clipboard is left untouched, so an accidental Cmd+C
 * with an empty selection doesn't wipe a previous copy).
 */
export function copySelection(): ClipboardPayload | null {
  const selectedIds = useSelection.getState().ids;
  const selectedSet = new Set(Object.keys(selectedIds));
  if (selectedSet.size === 0) return null;

  const allNodes = useNodes.getState().nodes;
  const allEdges = useEdges.getState().edges;

  const nodes = allNodes.filter((n) => selectedSet.has(n.id));
  if (nodes.length === 0) return null;

  // Internal edges only: both endpoints must be in the selected set.
  const edges = allEdges.filter(
    (e) => selectedSet.has(e.fromNode) && selectedSet.has(e.toNode),
  );

  clipboard = {
    nodes: nodes.map((n) => deepClone(n)),
    edges: edges.map((e) => deepClone(e)),
  };
  return clipboard;
}

/**
 * Pure id-remap: given a payload and id-minting functions, produce a fresh
 * subgraph with brand-new node + edge ids, node positions offset by
 * `(dx, dy)`, and edge endpoints remapped through the old→new node id map.
 *
 * No store access, no side effects — this is the unit-tested core.
 *
 * Edges whose endpoints are not both present in the payload's node id map
 * are dropped (defensive: `copySelection` already filters these out, but
 * keeping the guard here means `remapSubgraph` is safe to call on any
 * payload). The mint functions are injected so tests can supply
 * deterministic counters instead of `crypto.randomUUID`.
 */
export function remapSubgraph(
  payload: ClipboardPayload,
  mintNodeId: () => string,
  mintEdgeId: () => string,
  offset: { dx: number; dy: number },
): ClipboardPayload {
  const idMap = new Map<string, string>();

  const nodes: AimapNode[] = payload.nodes.map((n) => {
    const newId = mintNodeId();
    idMap.set(n.id, newId);
    return {
      ...deepClone(n),
      id: newId,
      x: n.x + offset.dx,
      y: n.y + offset.dy,
    };
  });

  const edges: Edge[] = [];
  for (const e of payload.edges) {
    const newFrom = idMap.get(e.fromNode);
    const newTo = idMap.get(e.toNode);
    // Drop dangling edges — an endpoint not present in this paste.
    if (newFrom === undefined || newTo === undefined) continue;
    edges.push({
      ...deepClone(e),
      id: mintEdgeId(),
      fromNode: newFrom,
      toNode: newTo,
    });
  }

  return { nodes, edges };
}

/**
 * Paste the in-app clipboard into the live stores.
 *
 * For each clipboard node: mint a new id, offset x/y by `(dx, dy)`, addNode.
 * For each internal clipboard edge: mint a new id, remap endpoints through
 * the old→new id map, addEdge. Finally, select the freshly-pasted nodes.
 *
 * Returns the new node + edge ids (useful for tests and for a future
 * "paste then immediately drag" gesture). Returns empty arrays when the
 * clipboard is empty.
 *
 * Offset rationale (V1): a fixed nudge (default +20,+20 canvas units) rather
 * than cursor-anchored placement. Fixed nudge is simpler, deterministic, and
 * matches the common editor behaviour where repeated pastes cascade down-
 * right. Cursor-anchored paste can be layered on later without changing this
 * signature. The caller (useClipboardKeys) passes the offset explicitly.
 */
export function pasteClipboard(offset: { dx: number; dy: number }): {
  nodeIds: string[];
  edgeIds: string[];
} {
  if (!clipboard || clipboard.nodes.length === 0) {
    return { nodeIds: [], edgeIds: [] };
  }

  const { nodes, edges } = remapSubgraph(
    clipboard,
    makeNodeId,
    makeEdgeId,
    offset,
  );

  const nodesStore = useNodes.getState();
  for (const n of nodes) nodesStore.addNode(n);

  const edgesStore = useEdges.getState();
  for (const e of edges) edgesStore.addEdge(e);

  const nodeIds = nodes.map((n) => n.id);
  // Select the pasted nodes so the user can immediately act on them.
  useSelection.getState().set(nodeIds);

  return { nodeIds, edgeIds: edges.map((e) => e.id) };
}
