// Phase 4: Cmd/Ctrl + A → select all nodes.
//
// Mounted once by <Canvas>, listens at the document level (same rationale as
// useDeleteKey / usePan's spacebar tracking — keyboard events don't bubble to
// Konva nodes, so the document is the canonical place for global shortcuts).
//
// Editing guard: when focus is in a form input, textarea, or contentEditable
// element, we let the browser handle Cmd/Ctrl+A (select-all-text) — the user
// must be able to select all text inside the edit-mode textarea or an edge
// label input without it hijacking to "select all cards".

import { useEffect } from "react";
import { useNodes } from "../../store/nodes.js";
import { useSelection } from "../../store/selection.js";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useSelectAllKey(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // `key` is "a"/"A"; gate on the platform-correct modifier. metaKey on
      // macOS, ctrlKey elsewhere — accept either so a Mac user with an
      // external PC keyboard, or a Linux user, both work.
      if (e.key !== "a" && e.key !== "A") return;
      if (!e.metaKey && !e.ctrlKey) return;
      if (isTypingTarget(e.target)) return;

      const allIds = useNodes.getState().nodes.map((n) => n.id);
      useSelection.getState().set(allIds);
      // Suppress the browser's native select-all (would highlight DOM text /
      // overlays sitting above the canvas).
      e.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
