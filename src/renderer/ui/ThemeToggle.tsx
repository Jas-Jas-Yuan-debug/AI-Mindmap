import { Moon, Sun } from "lucide-react";
import { Island } from "./Island.js";
import { useSettings } from "../store/settings.js";
import { resolveTheme } from "../theme/applyTheme.js";

// Theme toggle Island. Cycles the persisted `theme` setting; the actual
// data-theme application lives in theme/useThemeEffect (mounted in App), so a
// click here just updates the store and the effect re-applies instantly.
export function ThemeToggle() {
  const mode = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const isDark = resolveTheme(mode) === "dark";
  const next = isDark ? "light" : "dark";

  return (
    <Island ariaLabel="Theme">
      <button
        type="button"
        className="aim-icon-button aim-icon-button--lg"
        aria-label={`Switch to ${next} theme (current: ${mode})`}
        title={`Theme: ${mode} — click for ${next}`}
        onClick={() => setTheme(next)}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </Island>
  );
}
