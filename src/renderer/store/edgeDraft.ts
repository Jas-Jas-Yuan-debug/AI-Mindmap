// Zustand slice — transient state for an in-flight "drag-from-anchor" edge.
//
// Why a Zustand slice instead of plain React state in Canvas.tsx:
//   - Multiple components subscribe (the EdgeDraft ghost renderer + the
//     drag-handler hook on the Stage), and a Zustand store lets each
//     component pull only the fields it cares about without prop-drilling
//     through the Canvas tree.
//   - The draft is purely UI / transient — it never lands in the document
//     and never participates in undo/redo (Phase 4). Keeping it out of the
//     `edges` slice means Phase 4's history middleware doesn't pollute the
//     undo stack with one entry per mousemove during a drag.
//
// Lifecycle:
//   - `start({ fromNode, fromSide, cursor })`  -- on mousedown atop an anchor
//   - `update({ cursor, snapTo? })`             -- on mousemove
//   - `commit()` / `cancel()`                  -- on mouseup (caller decides)
//
// `snapTo` is optional. When the cursor hit-tests within
// EDGE_SNAP_THRESHOLD_CANVAS px of some OTHER card's anchor, the draw hook
// fills it in so EdgeDraft can render the ghost ending at the snap target's
// exact anchor position (instead of the raw cursor) — a strong visual
// affordance that "this will connect on release."

import { create } from "zustand";
import type { EdgeSide } from "./edges.js";

export interface DraftSnap {
  toNode: string;
  toSide: EdgeSide;
}

export interface EdgeDraftState {
  active: boolean;
  fromNode: string | null;
  fromSide: EdgeSide | null;
  /** Cursor in CANVAS space (already viewport-transformed). */
  cursor: { x: number; y: number } | null;
  /** Snap target if the cursor is near another card's anchor; else null. */
  snap: DraftSnap | null;

  start(args: {
    fromNode: string;
    fromSide: EdgeSide;
    cursor: { x: number; y: number };
  }): void;
  update(args: {
    cursor: { x: number; y: number };
    snap: DraftSnap | null;
  }): void;
  cancel(): void;
}

export const useEdgeDraft = create<EdgeDraftState>((set) => ({
  active: false,
  fromNode: null,
  fromSide: null,
  cursor: null,
  snap: null,
  start: ({ fromNode, fromSide, cursor }) =>
    set({ active: true, fromNode, fromSide, cursor, snap: null }),
  update: ({ cursor, snap }) => set({ cursor, snap }),
  cancel: () =>
    set({ active: false, fromNode: null, fromSide: null, cursor: null, snap: null }),
}));

/**
 * Snap distance (in canvas space) for picking a target anchor while drawing
 * a draft edge. 30 canvas units feels like a comfortable magnet radius at
 * 1× zoom; it scales naturally with zoom because cursor and anchor positions
 * are both in canvas space.
 */
export const EDGE_SNAP_THRESHOLD_CANVAS = 30;
