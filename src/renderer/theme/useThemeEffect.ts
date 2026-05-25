// Keeps `data-theme` in sync with the settings store, and — when the mode is
// "system" — re-applies on OS preference changes. Mount once (App).

import { useEffect } from "react";
import { useSettings } from "../store/settings.js";
import { applyThemeAttr } from "./applyTheme.js";

export function useThemeEffect(): void {
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    applyThemeAttr(theme);
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeAttr("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
}
