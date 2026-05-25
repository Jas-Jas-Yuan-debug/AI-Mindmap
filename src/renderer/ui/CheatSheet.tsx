// Keyboard shortcuts cheat sheet (opens on `?` or the Help button). Renders
// the SHORTCUT_GROUPS registry so it can never drift from the real bindings.

import { useEffect } from "react";
import { usePanels } from "../store/panels.js";
import { SHORTCUT_GROUPS } from "./shortcuts.js";
import { formatKeys } from "./keyFormat.js";
import "./Panels.css";

export function CheatSheet() {
  const open = usePanels((s) => s.open) === "cheatsheet";
  const close = usePanels((s) => s.close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="aim-modal-overlay" onMouseDown={close}>
      <div
        className="aim-modal aim-modal--wide"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="aim-modal__title">Keyboard shortcuts</h2>
        <div className="aim-cheatsheet__grid">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g.title} className="aim-cheatsheet__group">
              <h3 className="aim-cheatsheet__group-title">{g.title}</h3>
              <dl className="aim-cheatsheet__list">
                {g.items.map((s) => (
                  <div key={s.keys} className="aim-cheatsheet__row">
                    <dt className="aim-cheatsheet__keys">{formatKeys(s.keys)}</dt>
                    <dd className="aim-cheatsheet__desc">{s.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="aim-modal__actions">
          <button type="button" className="aim-modal__btn aim-modal__btn--primary" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
