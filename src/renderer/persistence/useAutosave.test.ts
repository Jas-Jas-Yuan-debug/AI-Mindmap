// Unit tests for the autosave decision + debounce (Phase 5 PR 3/3, sibling C).
//
// Covers:
//   - the pure `shouldAutosave` decision (dirty AND has-file),
//   - the debounce semantics via a small re-implementation of the timer loop
//     driven by vitest fake timers — rapid edits collapse to one save, and an
//     untitled (no-handle) doc never autosaves.

import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { shouldAutosave, AUTOSAVE_DEBOUNCE_MS } from "./useAutosave.js";

describe("shouldAutosave", () => {
  test("saves when dirty and a file handle exists", () => {
    expect(shouldAutosave({ dirty: true, hasFile: true })).toBe(true);
  });

  test("does not save a clean document", () => {
    expect(shouldAutosave({ dirty: false, hasFile: true })).toBe(false);
  });

  test("does not save an untitled (no-handle) document, even when dirty", () => {
    expect(shouldAutosave({ dirty: true, hasFile: false })).toBe(false);
  });

  test("does not save when both clean and untitled", () => {
    expect(shouldAutosave({ dirty: false, hasFile: false })).toBe(false);
  });
});

// A faithful, minimal model of the hook's debounce loop so we can assert the
// "rapid edits don't hammer disk" guarantee deterministically. Mirrors the
// arm()/clear() + shouldAutosave-on-fire logic in useAutosave().
function makeDebouncer(opts: {
  isDirty: () => boolean;
  hasFile: () => boolean;
  save: () => void;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    edit() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (shouldAutosave({ dirty: opts.isDirty(), hasFile: opts.hasFile() })) {
          opts.save();
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
  };
}

describe("autosave debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("rapid edits collapse into a single save after the quiet window", () => {
    const save = vi.fn();
    const d = makeDebouncer({
      isDirty: () => true,
      hasFile: () => true,
      save,
    });

    // Five edits in quick succession, each within the debounce window.
    for (let i = 0; i < 5; i++) {
      d.edit();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 100);
    }
    // No save yet — the window kept resetting.
    expect(save).not.toHaveBeenCalled();

    // Let the quiet period elapse fully after the last edit.
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("a single edit saves exactly once after the debounce window", () => {
    const save = vi.fn();
    const d = makeDebouncer({ isDirty: () => true, hasFile: () => true, save });
    d.edit();
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("untitled document: timer fires but does not save", () => {
    const save = vi.fn();
    const d = makeDebouncer({ isDirty: () => true, hasFile: () => false, save });
    d.edit();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).not.toHaveBeenCalled();
  });

  test("doc saved before the timer fires: save is skipped (no double write)", () => {
    let dirty = true;
    const save = vi.fn();
    const d = makeDebouncer({ isDirty: () => dirty, hasFile: () => true, save });
    d.edit();
    // An explicit Save lands before the debounce window elapses.
    dirty = false;
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).not.toHaveBeenCalled();
  });
});
