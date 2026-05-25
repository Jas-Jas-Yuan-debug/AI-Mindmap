// Render a shortcut's "mod+X" notation as ⌘X on macOS, Ctrl+X elsewhere.

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function formatKeys(keys: string): string {
  const mod = isMac() ? "⌘" : "Ctrl";
  return keys
    .replace(/\bmod\b/g, mod)
    .replace(/\bShift\b/g, isMac() ? "⇧" : "Shift")
    .replace(/\+/g, isMac() ? "" : "+");
}
