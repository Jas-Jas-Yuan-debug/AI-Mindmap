// Search bar (mod+F). Filters node text content (case-insensitive), shows a
// match count, and jumps the viewport to center each match as you step through
// with Enter / arrows. Selecting a match also selects the node so it's
// visually highlighted.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { useSearch } from "../store/search.js";
import { useNodes } from "../store/nodes.js";
import { useViewport } from "../store/viewport.js";
import { useSelection } from "../store/selection.js";
import { matchNodes } from "../search/searchNodes.js";
import "./Panels.css";

function centerOnNode(nodeId: string) {
  const n = useNodes.getState().nodes.find((nn) => nn.id === nodeId);
  if (!n) return;
  const v = useViewport.getState();
  const cx = n.x + n.width / 2;
  const cy = n.y + n.height / 2;
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  v.setViewport({ x: w / 2 - cx * v.zoom, y: h / 2 - cy * v.zoom, zoom: v.zoom });
}

export function SearchBar() {
  const open = useSearch((s) => s.open);
  const close = useSearch((s) => s.close);
  const nodes = useNodes((s) => s.nodes);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => matchNodes(nodes, query), [nodes, query]);

  // Focus the field when the bar opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Jump to the active match whenever it (or the match set) changes.
  useEffect(() => {
    if (matches.length === 0) return;
    const idx = Math.min(active, matches.length - 1);
    const id = matches[idx];
    if (id) {
      centerOnNode(id);
      useSelection.getState().select(id);
    }
  }, [matches, active]);

  if (!open) return null;

  const step = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    setActive((a) => (a + dir + matches.length) % matches.length);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    }
  };

  const count =
    matches.length === 0
      ? query.trim()
        ? "0 results"
        : ""
      : `${Math.min(active, matches.length - 1) + 1} / ${matches.length}`;

  return (
    <div className="aim-search" role="search">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search the canvas…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        aria-label="Search nodes"
      />
      <span className="aim-search__count">{count}</span>
      <button
        type="button"
        className="aim-search__btn"
        aria-label="Previous match"
        onClick={() => step(-1)}
      >
        <ChevronUp size={16} />
      </button>
      <button
        type="button"
        className="aim-search__btn"
        aria-label="Next match"
        onClick={() => step(1)}
      >
        <ChevronDown size={16} />
      </button>
      <button type="button" className="aim-search__btn" aria-label="Close search" onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}
