// Settings dialog (opens from the main menu). All values are persisted by the
// settings store (localStorage), so they survive a reload — plan §6 Phase 8
// "Settings persist". AI provider is a disabled placeholder until Phase 9.

import { useEffect } from "react";
import { usePanels } from "../store/panels.js";
import { useSettings, type ThemeMode } from "../store/settings.js";
import type { PresetColor } from "../../shared/aimap.js";
import { PRESET_COLOR_MAP } from "../canvas/nodes/TextNode.js";
import "./Panels.css";

const PRESETS: PresetColor[] = ["1", "2", "3", "4", "5", "6"];

export function SettingsDialog() {
  const open = usePanels((s) => s.open) === "settings";
  const close = usePanels((s) => s.close);

  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const gridVisible = useSettings((s) => s.gridVisible);
  const setGridVisible = useSettings((s) => s.setGridVisible);
  const autosaveMs = useSettings((s) => s.autosaveIntervalMs);
  const setAutosaveMs = useSettings((s) => s.setAutosaveIntervalMs);
  const defaultColor = useSettings((s) => s.defaultColor);
  const setDefaultColor = useSettings((s) => s.setDefaultColor);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="aim-modal-overlay" onMouseDown={close}>
      <div
        className="aim-modal"
        role="dialog"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="aim-modal__title">Settings</h2>

        <label className="aim-settings__row">
          <span>Theme</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeMode)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="aim-settings__row">
          <span>Show grid</span>
          <input
            type="checkbox"
            checked={gridVisible}
            onChange={(e) => setGridVisible(e.target.checked)}
          />
        </label>

        <label className="aim-settings__row">
          <span>Autosave delay (seconds)</span>
          <input
            type="number"
            min={0.25}
            max={60}
            step={0.25}
            value={(autosaveMs / 1000).toString()}
            onChange={(e) => setAutosaveMs(Number(e.target.value) * 1000)}
          />
        </label>

        <div className="aim-settings__row">
          <span>Default card color</span>
          <div className="aim-settings__swatches">
            <button
              type="button"
              className={`aim-swatch aim-swatch--none${defaultColor === undefined ? " is-active" : ""}`}
              title="None"
              aria-label="No default color"
              onClick={() => setDefaultColor(undefined)}
            />
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`aim-swatch${defaultColor === p ? " is-active" : ""}`}
                style={{ background: PRESET_COLOR_MAP[p] }}
                aria-label={`Default color ${p}`}
                onClick={() => setDefaultColor(p)}
              />
            ))}
          </div>
        </div>

        <label className="aim-settings__row">
          <span>AI provider</span>
          <select value="anthropic" disabled title="Configure in a later release">
            <option value="anthropic">Anthropic (set up an API key — Phase 9)</option>
          </select>
        </label>

        <div className="aim-modal__actions">
          <button type="button" className="aim-modal__btn aim-modal__btn--primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
