// Single source of truth for keyboard shortcuts. The cheat-sheet overlay
// renders this list, so "every action has a keyboard shortcut documented in
// the cheat sheet" (plan §6 Phase 8 exit criterion) stays true by construction
// — add a shortcut, add its entry here.
//
// `mod` renders as ⌘ on macOS and Ctrl elsewhere.

export interface Shortcut {
  keys: string; // human-readable, e.g. "mod+Z"
  description: string;
}

export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "File",
    items: [
      { keys: "mod+N", description: "New canvas" },
      { keys: "mod+O", description: "Open…" },
      { keys: "mod+S", description: "Save" },
      { keys: "mod+Shift+S", description: "Save As…" },
    ],
  },
  {
    title: "Edit",
    items: [
      { keys: "mod+Z", description: "Undo" },
      { keys: "mod+Shift+Z", description: "Redo" },
      { keys: "mod+C", description: "Copy selection" },
      { keys: "mod+X", description: "Cut selection" },
      { keys: "mod+V", description: "Paste" },
      { keys: "mod+A", description: "Select all" },
      { keys: "Delete / Backspace", description: "Delete selection" },
    ],
  },
  {
    title: "Create",
    items: [
      { keys: "Double-click", description: "New text card at cursor" },
      { keys: "Drag image / file in", description: "Image / file node" },
      { keys: "Paste URL", description: "Link node" },
      { keys: "Paste image", description: "Image node" },
      { keys: "Drag from anchor dot", description: "Connect an edge" },
    ],
  },
  {
    title: "View",
    items: [
      { keys: "Scroll", description: "Pan" },
      { keys: "Space + drag", description: "Pan" },
      { keys: "mod+scroll / pinch", description: "Zoom to cursor" },
      { keys: "mod+= / mod+-", description: "Zoom in / out" },
      { keys: "mod+0", description: "Reset zoom" },
      { keys: "mod+F", description: "Search" },
      { keys: "?", description: "This cheat sheet" },
    ],
  },
];
