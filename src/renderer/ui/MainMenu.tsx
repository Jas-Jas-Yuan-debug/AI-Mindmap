import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock,
  FilePlus,
  FolderOpen,
  Maximize2,
  Menu,
  Save,
  SaveAll,
} from "lucide-react";
import { Island } from "./Island.js";
import { useSettings } from "../store/settings.js";
import { useViewport } from "../store/viewport.js";
import { useDocument } from "../store/document.js";
import {
  newDocument,
  openDocument,
  openRecent,
  saveDocument,
  saveDocumentAs,
} from "../file/fileActions.js";
import "./MainMenu.css";

// Hamburger main menu with a small dropdown of commands.
//
// Phase 1 PR 3 introduced the View section (Toggle Grid / Fit to Content).
// Phase 5 PR 2 (this PR — sibling subagent B) adds the File section ABOVE
// View: New, Open, Save, Save As, and a Recent Files submenu (last 10).
//
// Behavior:
//   - Click hamburger → toggle open/close.
//   - Click outside the menu (or press Escape) → close.
//   - Click an entry → run its action, then close the menu.
//   - Recent Files is a nested submenu that opens on hover/focus; clicking an
//     entry opens that file.
//
// The shortcut labels shown on the right of each File entry are decorative —
// the actual key handling lives in
// `../canvas/interactions/useFileKeys.ts` (mounted by Canvas), so the
// shortcuts work whether or not the menu is open.

export interface MainMenuProps {
  /** Optional override for the hamburger's onClick (rarely useful; here for
   *  test/storybook ergonomics). When provided, dropdown behavior is
   *  bypassed. */
  onClick?: () => void;
}

/** Platform-aware modifier label for shortcut hints. */
function modKey(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

export function MainMenu({ onClick }: MainMenuProps) {
  const [open, setOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const gridVisible = useSettings((s) => s.gridVisible);
  const toggleGrid = useSettings((s) => s.toggleGrid);
  const fitToContent = useViewport((s) => s.fitToContent);
  const recentFiles = useDocument((s) => s.recentFiles);
  const refreshRecentFiles = useDocument((s) => s.refreshRecentFiles);

  const mod = modKey();

  // Load the recent-files list whenever the menu opens, so it reflects the
  // latest platform state (a file opened via shortcut while the menu was
  // closed should appear next time it's opened).
  useEffect(() => {
    if (open) void refreshRecentFiles();
  }, [open, refreshRecentFiles]);

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

  // Reset the submenu hover state whenever the whole menu closes.
  useEffect(() => {
    if (!open) setRecentOpen(false);
  }, [open]);

  const handleToggle = () => {
    if (onClick) {
      onClick();
      return;
    }
    setOpen((v) => !v);
  };

  const close = () => setOpen(false);

  // Run a (possibly async) action, then close the menu. We don't await the
  // promise here — the action surfaces its own errors and closing the menu
  // immediately keeps the UI snappy.
  const run = (fn: () => void | Promise<void>) => () => {
    void fn();
    close();
  };

  const recent = recentFiles.slice(0, 10);

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
            File
          </div>
          <button
            type="button"
            className="aim-mainmenu__item"
            role="menuitem"
            onClick={run(newDocument)}
          >
            <span className="aim-mainmenu__check" aria-hidden="true">
              <FilePlus size={14} />
            </span>
            <span className="aim-mainmenu__label">New</span>
            <span className="aim-mainmenu__shortcut" aria-hidden="true">
              {mod}N
            </span>
          </button>
          <button
            type="button"
            className="aim-mainmenu__item"
            role="menuitem"
            onClick={run(openDocument)}
          >
            <span className="aim-mainmenu__check" aria-hidden="true">
              <FolderOpen size={14} />
            </span>
            <span className="aim-mainmenu__label">Open…</span>
            <span className="aim-mainmenu__shortcut" aria-hidden="true">
              {mod}O
            </span>
          </button>
          <button
            type="button"
            className="aim-mainmenu__item"
            role="menuitem"
            onClick={run(saveDocument)}
          >
            <span className="aim-mainmenu__check" aria-hidden="true">
              <Save size={14} />
            </span>
            <span className="aim-mainmenu__label">Save</span>
            <span className="aim-mainmenu__shortcut" aria-hidden="true">
              {mod}S
            </span>
          </button>
          <button
            type="button"
            className="aim-mainmenu__item"
            role="menuitem"
            onClick={run(saveDocumentAs)}
          >
            <span className="aim-mainmenu__check" aria-hidden="true">
              <SaveAll size={14} />
            </span>
            <span className="aim-mainmenu__label">Save As…</span>
            <span className="aim-mainmenu__shortcut" aria-hidden="true">
              {mod}⇧S
            </span>
          </button>

          {/* Recent Files submenu. Opens on hover/focus of the parent row. */}
          <div
            className="aim-mainmenu__submenu"
            onMouseEnter={() => setRecentOpen(true)}
            onMouseLeave={() => setRecentOpen(false)}
          >
            <button
              type="button"
              className="aim-mainmenu__item"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={recentOpen}
              disabled={recent.length === 0}
              onFocus={() => setRecentOpen(true)}
              onClick={() => setRecentOpen((v) => !v)}
            >
              <span className="aim-mainmenu__check" aria-hidden="true">
                <Clock size={14} />
              </span>
              <span className="aim-mainmenu__label">Recent Files</span>
              <span className="aim-mainmenu__shortcut" aria-hidden="true">
                <ChevronRight size={14} />
              </span>
            </button>

            {recentOpen && recent.length > 0 ? (
              <div
                className="aim-mainmenu__submenu-panel aim-island"
                role="menu"
                aria-label="Recent files"
              >
                {recent.map((file, i) => (
                  <button
                    key={`${file.displayName}-${i}`}
                    type="button"
                    className="aim-mainmenu__item"
                    role="menuitem"
                    title={file.displayName}
                    onClick={run(() => openRecent(file))}
                  >
                    <span className="aim-mainmenu__label aim-mainmenu__label--truncate">
                      {file.displayName}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="aim-mainmenu__divider" role="separator" />

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
