// Dirty indicator in the title bar.
//
// Phase 5 (PR 3/3, sibling subagent C). Plan §6 Phase 5: "Dirty indicator in
// title bar (`AI-Mindmap — Untitled •` when unsaved)."
//
// Reflects two pieces of state into `document.title`:
//   - the current file's display name (or "Untitled" when there's no handle),
//   - a trailing `•` bullet when the document has unsaved edits.
//
// `buildDocumentTitle` is pure so the format is unit-testable without a DOM.

import { useEffect } from "react";
import { useDocStatus } from "../store/docStatus.js";
import { useDocument } from "../store/document.js";

const APP_NAME = "AI-Mindmap";

/**
 * Compose the window/tab title from the document name + dirty flag.
 * Examples:
 *   { name: undefined, dirty: false } → "AI-Mindmap — Untitled"
 *   { name: "notes.aimap", dirty: true } → "AI-Mindmap — notes.aimap •"
 */
export function buildDocumentTitle(input: {
  name?: string | undefined;
  dirty: boolean;
}): string {
  const name = input.name && input.name.length > 0 ? input.name : "Untitled";
  return `${APP_NAME} — ${name}${input.dirty ? " •" : ""}`;
}

/** Mount once (App). Keeps `document.title` in sync with name + dirty state. */
export function useDocumentTitle(): void {
  const name = useDocument((s) => s.currentFile?.displayName);
  const dirty = useDocStatus((s) => s.dirty);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = buildDocumentTitle({ name, dirty });
  }, [name, dirty]);
}
