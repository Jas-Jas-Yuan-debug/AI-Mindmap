// About dialog: app name, version, repo, license. No telemetry, by design.

import { useEffect } from "react";
import { usePanels } from "../store/panels.js";
import { APP_VERSION } from "../../shared/serialize.js";
import "./Panels.css";

const REPO_URL = "https://github.com/Jas-Jas-Yuan-debug/AI-Mindmap";

export function AboutDialog() {
  const open = usePanels((s) => s.open) === "about";
  const close = usePanels((s) => s.close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const openRepo = () => {
    void window.platform?.shell.openExternal(REPO_URL);
  };

  return (
    <div className="aim-modal-overlay" onMouseDown={close}>
      <div
        className="aim-modal"
        role="dialog"
        aria-label="About AI-Mindmap"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="aim-modal__title">AI-Mindmap</h2>
        <p className="aim-modal__body">
          An AI-augmented infinite whiteboard. Local-first, single-user, no telemetry.
        </p>
        <dl className="aim-cheatsheet__list">
          <div className="aim-cheatsheet__row">
            <dt className="aim-cheatsheet__keys">Version</dt>
            <dd className="aim-cheatsheet__desc">{APP_VERSION}</dd>
          </div>
          <div className="aim-cheatsheet__row">
            <dt className="aim-cheatsheet__keys">License</dt>
            <dd className="aim-cheatsheet__desc">MIT</dd>
          </div>
          <div className="aim-cheatsheet__row">
            <dt className="aim-cheatsheet__keys">Repository</dt>
            <dd className="aim-cheatsheet__desc">
              <button type="button" className="aim-link-button" onClick={openRepo}>
                {REPO_URL}
              </button>
            </dd>
          </div>
        </dl>
        <div className="aim-modal__actions">
          <button type="button" className="aim-modal__btn aim-modal__btn--primary" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
