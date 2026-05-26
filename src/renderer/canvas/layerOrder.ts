// Layer (z-order) reordering helpers for the properties panel.
//
// Per plan §5, the array order of `useNodes().nodes` IS the z-order: later in
// the array == drawn on top (front). The properties panel's 图层 (Layer)
// section calls these to send the selected node(s) to back / backward /
// forward / to front.
//
// These are PURE array transforms — no store access — so they're trivially
// unit-testable and the panel just feeds the result back into the store via
// `useNodes.setState({ nodes })` inside one `useHistory.transact(...)` step.
//
// Design notes:
//   - "Selected" nodes keep their relative order among themselves when moved
//     as a group (Excalidraw / PowerPoint behaviour). We never reshuffle the
//     selection internally; we only slide the whole block.
//   - Unknown / empty selections are a no-op (return the same array contents).
//   - We identify nodes by id (a `Record<id, true>` selection map matches the
//     `useSelection().ids` shape) so callers don't pass index lists.

export type IdSet = Record<string, true> | ReadonlySet<string>;

function has(sel: IdSet, id: string): boolean {
  return sel instanceof Set ? sel.has(id) : Boolean((sel as Record<string, true>)[id]);
}

/** Split a list into [selected, unselected] preserving each subgroup's order. */
function partition<T extends { id: string }>(
  items: readonly T[],
  sel: IdSet,
): { selected: T[]; rest: T[] } {
  const selected: T[] = [];
  const rest: T[] = [];
  for (const it of items) {
    if (has(sel, it.id)) selected.push(it);
    else rest.push(it);
  }
  return { selected, rest };
}

/**
 * Send the selected nodes to the very back (start of the array → drawn first
 * → visually behind everything). Selected nodes keep their relative order.
 */
export function sendToBack<T extends { id: string }>(
  items: readonly T[],
  sel: IdSet,
): T[] {
  const { selected, rest } = partition(items, sel);
  if (selected.length === 0) return [...items];
  return [...selected, ...rest];
}

/**
 * Send the selected nodes to the very front (end of the array → drawn last →
 * visually on top). Selected nodes keep their relative order.
 */
export function bringToFront<T extends { id: string }>(
  items: readonly T[],
  sel: IdSet,
): T[] {
  const { selected, rest } = partition(items, sel);
  if (selected.length === 0) return [...items];
  return [...rest, ...selected];
}

/**
 * Move the selected nodes one step toward the back (earlier in the array).
 *
 * Each selected run slides one slot past the unselected node immediately
 * before it. Runs of adjacent selected nodes move together; a selected node
 * already pinned at the front of its run (index 0 or preceded only by other
 * selected nodes) stays put. This matches Excalidraw's "send backward".
 */
export function sendBackward<T extends { id: string }>(
  items: readonly T[],
  sel: IdSet,
): T[] {
  const next = [...items];
  // Walk front→back. For each selected node whose predecessor is unselected,
  // swap it earlier. Skip the slot we just filled so a run shifts as a block.
  for (let i = 0; i < next.length; i++) {
    const cur = next[i]!;
    if (!has(sel, cur.id)) continue;
    if (i === 0) continue;
    const prev = next[i - 1]!;
    if (has(sel, prev.id)) continue; // part of the same run; already moved
    // Swap with the unselected predecessor.
    next[i - 1] = cur;
    next[i] = prev;
  }
  return next;
}

/**
 * Move the selected nodes one step toward the front (later in the array).
 *
 * Mirror of `sendBackward`: walk back→front and swap each selected node past
 * its unselected successor. Runs move as a block; a selected node already at
 * the end stays put.
 */
export function bringForward<T extends { id: string }>(
  items: readonly T[],
  sel: IdSet,
): T[] {
  const next = [...items];
  for (let i = next.length - 1; i >= 0; i--) {
    const cur = next[i]!;
    if (!has(sel, cur.id)) continue;
    if (i === next.length - 1) continue;
    const after = next[i + 1]!;
    if (has(sel, after.id)) continue; // part of the same run; already moved
    next[i + 1] = cur;
    next[i] = after;
  }
  return next;
}

export type LayerAction = "back" | "backward" | "forward" | "front";

/** Dispatch a layer action to the matching pure reorder helper. */
export function reorderLayer<T extends { id: string }>(
  action: LayerAction,
  items: readonly T[],
  sel: IdSet,
): T[] {
  switch (action) {
    case "back":
      return sendToBack(items, sel);
    case "backward":
      return sendBackward(items, sel);
    case "forward":
      return bringForward(items, sel);
    case "front":
      return bringToFront(items, sel);
  }
}
