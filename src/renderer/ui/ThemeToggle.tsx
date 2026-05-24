import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Island } from "./Island.js";

type Mode = "light" | "dark" | "system";

function applyTheme(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
}

function getInitial(): Mode {
  if (typeof document === "undefined") return "system";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return "system";
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(getInitial);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  // Resolve the effective theme for the icon (system → media query)
  const isDark =
    mode === "dark" ||
    (mode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const next: Mode = mode === "system" ? (isDark ? "light" : "dark") : mode === "dark" ? "light" : "dark";

  return (
    <Island ariaLabel="Theme">
      <button
        type="button"
        className="aim-icon-button aim-icon-button--lg"
        aria-label={`Switch to ${next} theme (current: ${mode})`}
        title={`Theme: ${mode} — click for ${next}`}
        onClick={() => setMode(next)}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </Island>
  );
}
