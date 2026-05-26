// Resolved-theme hook for the Konva renderers (dark-mode fix, Phase 8).
//
// PROBLEM: Konva paints to a <canvas> and cannot read CSS custom properties,
// so the node renderers can't pick up the `[data-theme]` tokens the rest of
// the chrome uses. They previously hardcoded light colors (white fill, slate
// border), which rendered as a glaring white card in dark mode.
//
// SOLUTION: read the CONCRETE theme ("light" | "dark") straight off
// `document.documentElement[data-theme]` — which `applyTheme.ts` always sets
// to a concrete value (never "system") — and re-render on change via a
// MutationObserver watching that single attribute. The renderers feed this
// into `resolveNodeStyle(node, theme, kind)` to get theme-appropriate hex
// values for any style field the user left unset.
//
// Initial value reuses `resolveTheme` so SSR/first-paint (when the attribute
// might not be present yet) still resolves sensibly from the OS preference.

import { useEffect, useState } from "react";
import { resolveTheme } from "./applyTheme.js";

export type ResolvedTheme = "light" | "dark";

/** Read the concrete theme from the `data-theme` attribute right now. */
function readThemeAttr(): ResolvedTheme {
  if (typeof document === "undefined") return resolveTheme("system");
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  // Attribute absent (pre-initThemePrePaint) — fall back to OS preference.
  return resolveTheme("system");
}

/**
 * Subscribe to the document's resolved theme. Returns "light" | "dark" and
 * triggers a re-render whenever `data-theme` on <html> changes (theme toggle,
 * or — when mode is "system" — an OS preference change that `useThemeEffect`
 * re-applies to the attribute).
 */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(readThemeAttr);

  useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof MutationObserver === "undefined"
    ) {
      return;
    }
    const el = document.documentElement;
    // Re-sync once on mount in case the attribute changed between the initial
    // useState call and the effect running.
    setTheme(readThemeAttr());
    const observer = new MutationObserver(() => setTheme(readThemeAttr()));
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
