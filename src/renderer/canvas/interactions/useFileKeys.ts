// Hook: register document-level keyboard shortcuts for the File menu.
//
// Phase 5 (PR 2/3, sibling subagent B — file menu UX). Mounted once by
// <Canvas> alongside useHistoryKeys / useClipboardKeys etc.
//
// Bindings (Cmd on macOS, Ctrl elsewhere — `metaKey || ctrlKey`):
//   - Cmd/Ctrl + N            → New
//   - Cmd/Ctrl + O            → Open
//   - Cmd/Ctrl + S            → Save
//   - Cmd/Ctrl + Shift + S    → Save As
//
// Typing guard: when focus is inside an <input>, <textarea>, <select>, or a
// contentEditable element, we let the browser handle the keystroke so the
// shortcut doesn't fire while the user is editing a card / edge label. Same
// isTypingTarget shape as useHistoryKeys / useDeleteKey.
//
// Why document-level: keyboard events don't bubble to Konva nodes, so the
// document is the canonical place to catch global app shortcuts. The file
// actions are async (they await the platform dialogs); we fire-and-forget
// from the handler — any error is surfaced inside the action via
// reportFileError, never bubbled out of the listener.

import { useEffect } from "react";
import {
  newDocument,
  openDocument,
  saveDocument,
  saveDocumentAs,
} from "../../file/fileActions.js";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useFileKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      if (key === "n") {
        e.preventDefault();
        newDocument();
        return;
      }
      if (key === "o") {
        e.preventDefault();
        void openDocument();
        return;
      }
      if (key === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          void saveDocumentAs();
        } else {
          void saveDocument();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
