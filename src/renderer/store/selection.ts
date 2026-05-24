// Zustand selection slice — tracks which node ids are currently selected.
//
// Why a separate slice from `nodes`: selection is a UI concern (which cards
// have a focus ring, which cards a delete keystroke targets), it changes
// far more often than the node data, and it's NOT persisted to the file.
// Keeping it out of the nodes slice means a Phase 4 history middleware can
// wrap mutations on `nodes` without polluting the undo stack with every
// click.
//
// Storage choice: a plain object `Record<string, true>` rather than a
// JS `Set`. Two reasons:
//   1. Zustand's shallow equality treats two Sets as different even when
//      they hold the same keys — that causes unnecessary re-renders for
//      every component that reads selection. With a record we can compute
//      a fresh object only when the selection actually changes.
//   2. O(1) lookup via `ids[id]` for the hot `isSelected` path called
//      from every TextNode render.
//
// Phase 4 will add lasso + Shift+click; the `additive` flag on `select`
// and the `toggle`/`set` actions are sized for that already so Phase 4
// doesn't need to rewrite the API.
//
// Public API used by sibling subagents:
//   - `useSelection` — the Zustand hook. Used by `TextNode.tsx` (this PR)
//     for `selected={...}` and by sibling B's delete-key handler for the
//     `ids` snapshot.
//   - `useSelection.getState().select(id)` — what the Stage click handler
//     calls when the user clicks a card.
//   - `useSelection.getState().clear()` — called when the user clicks
//     empty canvas.

import { create } from "zustand";

export interface SelectionState {
  /** Map of selected id → true. Use `isSelected(id)` for O(1) checks. */
  ids: Record<string, true>;

  /**
   * Select a single id. With `additive=true`, append to the current
   * selection (used by Shift+click in Phase 4). With `additive=false`
   * (the default), the new selection replaces whatever was selected.
   */
  select(id: string, additive?: boolean): void;
  /** Remove `id` from the current selection. No-op if not selected. */
  deselect(id: string): void;
  /** Flip the selection state of `id`. Useful for Shift+click in Phase 4. */
  toggle(id: string): void;
  /** Replace the selection wholesale with the given ids. */
  set(ids: string[]): void;
  /** Drop all selection. Called when the user clicks empty canvas. */
  clear(): void;
  /** O(1) check used by render code. */
  isSelected(id: string): boolean;
}

export const useSelection = create<SelectionState>((set, get) => ({
  ids: {},
  select: (id, additive = false) =>
    set((s) =>
      additive ? { ids: { ...s.ids, [id]: true } } : { ids: { [id]: true } },
    ),
  deselect: (id) =>
    set((s) => {
      if (!s.ids[id]) return s;
      // Build a fresh object minus the dropped id. Object-rest destructure
      // would also work; this form keeps the eslint no-unused-vars rule
      // happy without a `_` discard.
      const next: Record<string, true> = {};
      for (const k of Object.keys(s.ids)) {
        if (k !== id) next[k] = true;
      }
      return { ids: next };
    }),
  toggle: (id) =>
    set((s) => {
      if (s.ids[id]) {
        const next: Record<string, true> = {};
        for (const k of Object.keys(s.ids)) {
          if (k !== id) next[k] = true;
        }
        return { ids: next };
      }
      return { ids: { ...s.ids, [id]: true } };
    }),
  set: (ids) =>
    set({ ids: Object.fromEntries(ids.map((i) => [i, true])) as Record<string, true> }),
  clear: () => set({ ids: {} }),
  isSelected: (id) => Boolean(get().ids[id]),
}));
