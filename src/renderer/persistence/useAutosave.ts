// Autosave: write the live document back to its backing file after edits stop
// for a beat, so the user never loses more than ~1s of work to a crash.
//
// Phase 5 (PR 3/3, sibling subagent C). Plan §6 Phase 5: "Autosave to the
// currently-open file after every committed action, debounced 1s." and the
// exit criterion "Autosave debounce works (rapid edits don't hammer disk)".
//
// Design:
//   - We subscribe to the `docStatus.dirty` flag (which `installDocStatus-
//     Subscriptions()` flips on any nodes/edges/viewport edit).
//   - On each dirty transition we (re)arm a 1000ms timer. Rapid edits keep
//     resetting the timer, so disk is touched at most once per quiet period —
//     this is the "don't hammer disk" guarantee.
//   - When the timer fires we save THROUGH the same `saveDocument()` seam the
//     File menu uses, which calls `platform.files.saveCanvas` and then
//     `markSaved()`. We only save when there is a backing file handle: an
//     "Untitled" (never-saved) document has nowhere to autosave to, so we
//     leave it dirty until the user does an explicit Save As.
//
// The save decision is factored into the pure `shouldAutosave()` below so it
// can be unit-tested without React / timers; the hook is a thin shell around
// it plus a debounce timer.

import { useEffect } from "react";
import { useDocStatus } from "../store/docStatus.js";
import { useDocument } from "../store/document.js";
import { useSettings } from "../store/settings.js";
import { useNodes } from "../store/nodes.js";
import { useEdges } from "../store/edges.js";
import { useViewport } from "../store/viewport.js";
import { saveDocument } from "../file/fileActions.js";

/** Debounce window in ms. Plan §6: "debounced 1s". */
export const AUTOSAVE_DEBOUNCE_MS = 1000;

/** Inputs the autosave decision depends on. Pure, no store access. */
export interface AutosaveInput {
  /** Does the live document differ from the last save? */
  dirty: boolean;
  /** Is there a backing file to write to? (false for an Untitled doc.) */
  hasFile: boolean;
}

/**
 * Pure decision: should the debounced autosave timer write the document now?
 *
 * Only when the document is BOTH dirty AND has a backing file handle. A clean
 * document has nothing to save; an Untitled document has nowhere to save to
 * (autosave never invents a path — the user must choose one via Save As).
 */
export function shouldAutosave(input: AutosaveInput): boolean {
  return input.dirty && input.hasFile;
}

/**
 * Mount once (App). Debounced autosave: arms a timer on every dirty transition
 * and writes the document when edits go quiet for `AUTOSAVE_DEBOUNCE_MS`.
 */
export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const arm = () => {
      clear();
      // Phase 8: the debounce window is user-configurable (Settings →
      // autosave delay). Fall back to the 1s default if unset/out of range.
      const delay = useSettings.getState().autosaveIntervalMs || AUTOSAVE_DEBOUNCE_MS;
      timer = setTimeout(() => {
        timer = null;
        const decision = shouldAutosave({
          dirty: useDocStatus.getState().dirty,
          hasFile: useDocument.getState().currentFile !== null,
        });
        if (decision) {
          // saveDocument() resolves markSaved() on success (clearing dirty) and
          // surfaces any failure through reportFileError without crashing.
          void saveDocument();
        }
      }, delay);
    };

    // Re-arm on EVERY edit so rapid edits keep pushing the save out (the
    // "don't hammer disk" guarantee). We subscribe to the underlying document
    // stores rather than the `dirty` flag, because `markDirty` is idempotent
    // (no-ops once already dirty) and so wouldn't re-notify on subsequent edits
    // within the same dirty span. The timer's own callback re-checks the live
    // dirty/hasFile state via `shouldAutosave`, so a save that happened to land
    // (clearing dirty) before the timer fires simply no-ops.
    const onEdit = (cur: unknown, prev: unknown) => {
      if (cur !== prev) arm();
    };
    const unNodes = useNodes.subscribe((s, p) => onEdit(s.nodes, p.nodes));
    const unEdges = useEdges.subscribe((s, p) => onEdit(s.edges, p.edges));
    const unViewport = useViewport.subscribe((s, p) => {
      if (s.x !== p.x || s.y !== p.y || s.zoom !== p.zoom) arm();
    });

    // If we mount while already dirty (e.g. fast edits before App effects run),
    // arm immediately so that initial dirtiness isn't stranded.
    if (useDocStatus.getState().dirty) arm();

    return () => {
      unNodes();
      unEdges();
      unViewport();
      clear();
    };
  }, []);
}
