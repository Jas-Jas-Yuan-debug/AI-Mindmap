// Pure node search: given the node list and a query, return the ids of nodes
// whose text content matches (case-insensitive substring), in document order.
// Kept pure (no store/DOM) so it's unit-testable; the SearchBar drives it.

import type { AimapNode } from "../store/nodes.js";

/** The searchable text for a node (varies by type). */
export function searchableText(n: AimapNode): string {
  switch (n.type) {
    case "text":
      return n.text;
    case "group":
      return n.label ?? "";
    case "link":
      return `${n.title ?? ""} ${n.url}`;
    case "file":
      return n.displayName ?? n.file;
    case "image":
      return n.alt ?? "";
    default:
      return "";
  }
}

export function matchNodes(nodes: readonly AimapNode[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return nodes
    .filter((n) => searchableText(n).toLowerCase().includes(q))
    .map((n) => n.id);
}
