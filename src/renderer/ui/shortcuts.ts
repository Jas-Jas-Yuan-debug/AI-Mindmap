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
      { keys: "mod+G", description: "Group selection" },
      { keys: "mod+Shift+G", description: "Ungroup" },
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
    title: "Tools",
    items: [
      { keys: "V", description: "Select tool" },
      { keys: "M", description: "Box-select tool (drag a marquee)" },
      { keys: "H", description: "Hand (pan) tool" },
      { keys: "T", description: "Text card tool (click to place)" },
      { keys: "G", description: "Group tool (click to place)" },
      { keys: "E", description: "Edge tool (reveals anchors)" },
      { keys: "R", description: "Rectangle shape" },
      { keys: "D", description: "Diamond shape" },
      { keys: "O", description: "Ellipse shape" },
      { keys: "A", description: "Arrow tool" },
      { keys: "P", description: "Draw (pencil) tool" },
      { keys: "X", description: "Eraser tool" },
      { keys: "I", description: "Insert image" },
      { keys: "L", description: "Insert link" },
      { keys: "Line / Lock", description: "Toolbar buttons (no single-key shortcut)" },
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
