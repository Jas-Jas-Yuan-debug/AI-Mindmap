// Friendly file-error dialog (Phase 5 PR 3/3, sibling subagent C).
//
// Implements the `window.__aimReportFileError` seam that `fileActions` calls
// when a file open/save fails (corrupt JSON, Zod-invalid doc, disk error). It
// replaces the console + `alert()` fallback with a themed modal that never
// crashes the app.
//
// Plan §6 Phase 5: "Error handling: corrupt file → friendly error dialog,
// doesn't crash" + exit criterion "Corrupt JSON shows error … partial-corrupt
// (valid JSON, fails Zod) shows specific field error".
//
// The message → friendly-copy mapping lives in the pure `fileErrorMessage.ts`
// so it can be unit-tested without a DOM.

import { useEffect, useRef, useState } from "react";
import {
  friendlyFileError,
  type FriendlyFileError,
} from "../persistence/fileErrorMessage.js";
import "./Modal.css";

export function ErrorDialog() {
  const [error, setError] = useState<FriendlyFileError | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Register the global seam fileActions calls. Stored on window so it works
  // regardless of where the failure originates (menu, shortcut, autosave).
  useEffect(() => {
    window.__aimReportFileError = (op, message) => {
      setError(friendlyFileError(op, message));
    };
    return () => {
      delete window.__aimReportFileError;
    };
  }, []);

  // Focus the dismiss button and wire Escape-to-close while open.
  useEffect(() => {
    if (!error) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setError(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [error]);

  if (!error) return null;

  return (
    <div
      className="aim-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        // Click on the backdrop (not the dialog) dismisses.
        if (e.target === e.currentTarget) setError(null);
      }}
    >
      <div
        className="aim-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={error.title}
      >
        <h2 className="aim-modal__title">{error.title}</h2>
        <p className="aim-modal__body">{error.body}</p>
        {error.detail ? (
          <pre className="aim-modal__detail">{error.detail}</pre>
        ) : null}
        <div className="aim-modal__actions">
          <button
            ref={closeRef}
            type="button"
            className="aim-modal__btn aim-modal__btn--primary"
            onClick={() => setError(null)}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorDialog;
