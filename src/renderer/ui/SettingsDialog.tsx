// Settings dialog (opens from the main menu). All values are persisted by the
// settings store (localStorage), so they survive a reload — plan §6 Phase 8
// "Settings persist". AI provider section replaced with multi-provider panel
// (Phase 9b) — lets the user configure any of the 5 supported providers and
// pick which one is active for chat.

import {
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { usePanels } from "../store/panels.js";
import { useSettings, type ThemeMode } from "../store/settings.js";
import type { PresetColor } from "../../shared/aimap.js";
import { PRESET_COLOR_MAP } from "../canvas/nodes/TextNode.js";
import { useAiProvider } from "../store/aiProvider.js";
import type { ProviderId, ProviderMeta, AuthStatus } from "../../shared/platform.js";
import "./Panels.css";

const PRESETS: PresetColor[] = ["1", "2", "3", "4", "5", "6"];

// ---------------------------------------------------------------------------
// ProviderRow — one row per AI provider in the settings list
// ---------------------------------------------------------------------------

interface ProviderRowProps {
  meta: ProviderMeta;
  status: AuthStatus | undefined;
  onSave(id: ProviderId, key: string): Promise<void>;
  onClear(id: ProviderId): Promise<void>;
}

function ProviderRow({ meta, status, onSave, onClear }: ProviderRowProps) {
  const [input, setInput] = useState("");

  const configured = status?.configured ?? false;
  const method = status?.method ?? null;

  const methodLabel =
    method === "apiKey" ? "API key" : method === "oauth" ? "OAuth" : null;

  const handleSave = async () => {
    const trimmed = input.trim();
    if (trimmed) {
      await onSave(meta.id, trimmed);
      setInput("");
    }
  };

  const handleClear = async () => {
    await onClear(meta.id);
    setInput("");
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) void handleSave();
  };

  const handleKeyLink = (e: ReactMouseEvent) => {
    e.preventDefault();
    if (window.platform?.shell) {
      void window.platform.shell.openExternal(meta.keyUrl);
    } else {
      window.open(meta.keyUrl, "_blank", "noreferrer");
    }
  };

  return (
    <div className="aim-provider-row">
      <div className="aim-provider-row__head">
        <span className="aim-provider-row__label">{meta.label}</span>
        <span
          className={`aim-provider-status${configured ? " aim-provider-status--ok" : ""}`}
          aria-label={configured ? `Connected via ${methodLabel ?? "unknown"}` : "Not configured"}
        >
          {configured ? (
            <>● Connected{methodLabel ? ` (${methodLabel})` : ""}</>
          ) : (
            "Not configured"
          )}
        </span>
      </div>

      <div className="aim-provider-key">
        <input
          type="password"
          className="aim-provider-key__input"
          placeholder={configured ? "•••• (set — enter new key to replace)" : meta.keyPlaceholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={`${meta.label} API key`}
          autoComplete="off"
        />
        {input.trim() ? (
          <button
            type="button"
            className="aim-modal__btn"
            onClick={() => void handleSave()}
          >
            Save
          </button>
        ) : configured ? (
          <button
            type="button"
            className="aim-modal__btn aim-modal__btn--danger"
            onClick={() => void handleClear()}
          >
            Clear
          </button>
        ) : (
          <button
            type="button"
            className="aim-modal__btn"
            disabled
          >
            Save
          </button>
        )}
        {meta.supportsOAuth && (
          <button
            type="button"
            className="aim-modal__btn"
            disabled
            title="Coming soon"
          >
            Connect (OAuth)
          </button>
        )}
      </div>

      <a
        href={meta.keyUrl}
        className="aim-provider-link"
        onClick={handleKeyLink}
        rel="noreferrer"
        target="_blank"
        aria-label={`Get a ${meta.label} API key (opens in browser)`}
      >
        Get a key ↗
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsDialog
// ---------------------------------------------------------------------------

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

  // AI provider store
  const providers = useAiProvider((s) => s.providers);
  const statuses = useAiProvider((s) => s.statuses);
  const active = useAiProvider((s) => s.active);
  const loaded = useAiProvider((s) => s.loaded);
  const setActive = useAiProvider((s) => s.setActive);
  const setKey = useAiProvider((s) => s.setKey);
  const clearAuth = useAiProvider((s) => s.clearAuth);

  const isWeb = typeof window !== "undefined" && window.platform?.kind === "web";

  // Refresh provider state each time the dialog opens
  useEffect(() => {
    if (open) void useAiProvider.getState().refresh();
  }, [open]);

  // Keyboard: close on Escape
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

        {/* ── Appearance ── */}
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

        {/* ── AI Providers ── */}
        <div className="aim-settings__section-title">AI providers</div>

        {isWeb ? (
          <div className="aim-settings__row">
            <span className="aim-cheatsheet__desc">Not available in the web build</span>
          </div>
        ) : (
          <>
            {/* Active provider selector */}
            <label className="aim-settings__row">
              <span>Active provider</span>
              <select
                value={active}
                onChange={(e) => void setActive(e.target.value as ProviderId)}
                disabled={!loaded || providers.length === 0}
              >
                {providers.length === 0 ? (
                  <option value={active}>{active}</option>
                ) : (
                  providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))
                )}
              </select>
            </label>

            {/* Provider list */}
            <div className="aim-provider-list" aria-label="Provider credentials">
              {!loaded ? (
                <p className="aim-provider-list__loading">Loading…</p>
              ) : providers.length === 0 ? (
                <p className="aim-provider-list__loading">No providers available.</p>
              ) : (
                providers.map((meta) => (
                  <ProviderRow
                    key={meta.id}
                    meta={meta}
                    status={statuses[meta.id]}
                    onSave={setKey}
                    onClear={clearAuth}
                  />
                ))
              )}
            </div>
          </>
        )}

        <div className="aim-modal__actions">
          <button type="button" className="aim-modal__btn aim-modal__btn--primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
