import { useEffect, useRef, useState } from "react";
import { Check, Maximize2, Menu } from "lucide-react";
import { Island } from "./Island.js";
import { useSettings } from "../store/settings.js";
import { useViewport } from "../store/viewport.js";
import "./MainMenu.css";

// Hamburger main menu with a small dropdown of commands.
//
// Phase 1 PR 3 introduces just the entries the plan asks for (View section:
// "Toggle Grid", "Fit to Content"). Future phases will grow this menu with
// File, Edit, etc. — keeping the implementation deliberately minimal so the
// pattern is easy to extend.
//
// Behavior:
//   - Click hamburger → toggle open/close.
//   - Click outside the menu (or press Escape) → close.
//   - Click an entry → run its action, then close the menu.

export interface MainMenuProps {
  /** Optional override for the hamburger's onClick (rarely useful; here for
   *  test/storybook ergonomics). When provided, dropdown behavior is
   *  bypassed. */
  onClick?: () => void;
}

export function MainMenu({ onClick }: MainMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const gridVisible = useSettings((s) => s.gridVisible);
  const toggleGrid = useSettings((s) => s.toggleGrid);
  const fitToContent = useViewport((s) => s.fitToContent);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleToggle = () => {
    if (onClick) {
      onClick();
      return;
    }
    setOpen((v) => !v);
  };

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="aim-mainmenu" ref={containerRef}>
      <Island ariaLabel="Main menu">
        <button
          type="button"
          className="aim-icon-button aim-icon-button--lg"
          aria-label="Open main menu"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Main menu"
          onClick={handleToggle}
        >
          <Menu size={18} />
        </button>
      </Island>

      {open ? (
        <div
          className="aim-mainmenu__dropdown aim-island"
          role="menu"
          aria-label="Main menu items"
        >
          <div className="aim-mainmenu__section-label" aria-hidden="true">
            View
          </div>
          <button
            type="button"
            className="aim-mainmenu__item"
            role="menuitemcheckbox"
            aria-checked={gridVisible}
            onClick={run(toggleGrid)}
          >
            <span className="aim-mainmenu__check" aria-hidden="true">
              {gridVisible ? <Check size={14} /> : null}
            </span>
            <span className="aim-mainmenu__label">Toggle Grid</span>
          </button>
          <button
            type="button"
            className="aim-mainmenu__item"
            role="menuitem"
            onClick={run(fitToContent)}
          >
            <span className="aim-mainmenu__check" aria-hidden="true">
              <Maximize2 size={14} />
            </span>
            <span className="aim-mainmenu__label">Fit to Content</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
