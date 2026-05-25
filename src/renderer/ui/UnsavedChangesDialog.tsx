// "Unsaved changes" prompt (Phase 5 PR 3/3, sibling subagent C).
//
// Implements the `window.__aimConfirmDiscard` seam that `fileActions` awaits
// before New / Open when the document is dirty. Resolves:
//   - true  → proceed (discard or save-then-proceed)
//   - false → cancel (abort the New/Open)
//
// Plan §6 Phase 5: "'Unsaved changes' prompt when closing a dirty window."
// The in-app New/Open guard is the primary path; window-close is also guarded
// (web: beforeunload preventDefault while dirty; Electron close interception is
// best-effort — see note below).
//
// Flow when dirty:
//   Save        → run saveDocument(); on success resolve(true). (If the save
//                 fails, the error dialog shows and we resolve(false) so the
//                 user's data isn't silently discarded.)
//   Don't Save  → resolve(true) without saving (intentional discard).
//   Cancel/Esc  → resolve(false).
//
// When the document is already clean, the seam resolves(true) immediately
// without showing the modal.

import { useCallback, useEffect, useRef, useState } from "react";
import { useDocStatus } from "../store/docStatus.js";
import { saveDocument } from "../file/fileActions.js";
import "./Modal.css";

// Electron-only bridge surface for the window-close guard (undefined on web).
interface AimWindowBridge {
  setDirty(dirty: boolean): void;
  onConfirmClose(handler: () => Promise<boolean> | boolean): void;
}
function windowBridge(): AimWindowBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const b = (window as unknown as { aimBridge?: { window?: AimWindowBridge } })
    .aimBridge;
  return b?.window;
}

export function UnsavedChangesDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // The pending promise's resolver — set while the modal is open.
  const resolverRef = useRef<((proceed: boolean) => void) | null>(null);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);

  const settle = useCallback((proceed: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    setBusy(false);
    if (resolve) resolve(proceed);
  }, []);

  // Register the confirm seam. Resolves immediately when clean; otherwise opens
  // the modal and parks the resolver for the button handlers.
  useEffect(() => {
    window.__aimConfirmDiscard = () => {
      if (!useDocStatus.getState().dirty) return true;
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setOpen(true);
      });
    };
    return () => {
      delete window.__aimConfirmDiscard;
    };
  }, []);

  // Web: warn on tab/window close while dirty. This is the portable path and a
  // harmless no-op in Electron (Electron's own close is guarded below).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useDocStatus.getState().dirty) {
        e.preventDefault();
        // Legacy browsers require returnValue to be set to trigger the prompt.
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Electron: keep the main process informed of the dirty flag (so it can
  // intercept window close) and register the confirm-close handler that runs
  // the SAME save/discard modal the in-app New/Open guard uses.
  useEffect(() => {
    const bridge = windowBridge();
    if (!bridge) return; // web — beforeunload above covers it

    bridge.setDirty(useDocStatus.getState().dirty);
    const unsub = useDocStatus.subscribe((s, prev) => {
      if (s.dirty !== prev.dirty) bridge.setDirty(s.dirty);
    });

    bridge.onConfirmClose(() => {
      // Reuse the same prompt the New/Open guard uses. If it's not registered
      // yet (shouldn't happen — same component), fall back to "proceed".
      const confirm = window.__aimConfirmDiscard;
      return confirm ? confirm() : true;
    });

    return () => unsub();
  }, []);

  // Focus the default action + Escape = Cancel while open.
  useEffect(() => {
    if (!open) return;
    saveBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, settle]);

  const onSave = useCallback(async () => {
    setBusy(true);
    const before = useDocStatus.getState().dirty;
    await saveDocument();
    // If the save succeeded the doc is now clean; proceed. If it failed (still
    // dirty), the error dialog has surfaced — abort so we don't discard.
    const stillDirty = useDocStatus.getState().dirty;
    settle(before ? !stillDirty : true);
  }, [settle]);

  if (!open) return null;

  return (
    <div className="aim-modal-overlay" role="presentation">
      <div
        className="aim-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label="Unsaved changes"
      >
        <h2 className="aim-modal__title">Unsaved changes</h2>
        <p className="aim-modal__body">
          You have unsaved changes. Do you want to save them before continuing?
        </p>
        <div className="aim-modal__actions">
          <button
            type="button"
            className="aim-modal__btn"
            disabled={busy}
            onClick={() => settle(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="aim-modal__btn aim-modal__btn--danger"
            disabled={busy}
            onClick={() => settle(true)}
          >
            Don&apos;t Save
          </button>
          <button
            ref={saveBtnRef}
            type="button"
            className="aim-modal__btn aim-modal__btn--primary"
            disabled={busy}
            onClick={() => void onSave()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default UnsavedChangesDialog;
