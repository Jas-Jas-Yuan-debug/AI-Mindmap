// Theme application: maps the settings `theme` mode onto the document's
// `data-theme` attribute, which the CSS tokens in ui/theme.css key off
// (`[data-theme="dark"]`). "system" resolves to the OS preference and tracks
// changes live.
//
// No-flash: `initThemePrePaint()` reads the persisted theme straight from
// localStorage and applies it synchronously at module load (before React
// mounts), so the first paint is already in the right theme.

import type { ThemeMode } from "../store/settings.js";

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** The concrete theme ("light"/"dark") a mode resolves to right now. */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return prefersDark() ? "dark" : "light";
  return mode;
}

/** Set `data-theme` to the resolved concrete theme. Instant; no transition. */
export function applyThemeAttr(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
}

/**
 * Read the persisted theme from the zustand-persist payload WITHOUT importing
 * the store (avoids pulling React in before paint). Safe-guards every step so
 * a malformed/absent value falls back to "system".
 */
function readPersistedTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem("aim.settings");
    if (!raw) return "system";
    const parsed = JSON.parse(raw) as { state?: { theme?: ThemeMode } };
    const t = parsed?.state?.theme;
    return t === "light" || t === "dark" || t === "system" ? t : "system";
  } catch {
    return "system";
  }
}

/** Apply the persisted theme synchronously at startup (call from main.tsx). */
export function initThemePrePaint(): void {
  applyThemeAttr(readPersistedTheme());
}
