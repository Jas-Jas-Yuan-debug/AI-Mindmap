// Onboarding hint shown on a blank canvas. Disappears as soon as the first
// node exists. pointer-events: none so it never blocks canvas interaction.

import { useNodes } from "../store/nodes.js";
import "./EmptyState.css";

const HINTS: { keys: string; text: string }[] = [
  { keys: "Double-click", text: "add a text card anywhere" },
  { keys: "T / G", text: "card / group tool" },
  { keys: "Drag in", text: "drop an image or file" },
  { keys: "Paste", text: "a link or image" },
  { keys: "⌘F · ?", text: "search · shortcuts" },
];

export function EmptyState() {
  const count = useNodes((s) => s.nodes.length);
  if (count > 0) return null;
  return (
    <div className="aim-empty" aria-hidden="true">
      <div className="aim-empty__card">
        <h1 className="aim-empty__title">A blank canvas</h1>
        <p className="aim-empty__sub">Start anywhere on the infinite board.</p>
        <ul className="aim-empty__hints">
          {HINTS.map((h) => (
            <li key={h.keys}>
              <kbd>{h.keys}</kbd>
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
