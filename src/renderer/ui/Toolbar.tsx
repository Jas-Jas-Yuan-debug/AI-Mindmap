import { MousePointer2, Type, BoxSelect, ArrowRight, Image, Link2 } from "lucide-react";
import { Island } from "./Island.js";

type Tool = "select" | "text" | "group" | "edge" | "image" | "link";

const TOOLS: { id: Tool; label: string; shortcut: string; Icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Select", shortcut: "V", Icon: MousePointer2 },
  { id: "text", label: "Text card", shortcut: "T", Icon: Type },
  { id: "group", label: "Group", shortcut: "G", Icon: BoxSelect },
  { id: "edge", label: "Edge", shortcut: "E", Icon: ArrowRight },
  { id: "image", label: "Image", shortcut: "I", Icon: Image },
  { id: "link", label: "Link", shortcut: "L", Icon: Link2 },
];

export interface ToolbarProps {
  activeTool?: Tool;
  onSelectTool?: (t: Tool) => void;
}

export function Toolbar({ activeTool = "select", onSelectTool }: ToolbarProps) {
  return (
    <Island className="aim-island--row" ariaLabel="Tool palette">
      {TOOLS.map(({ id, label, shortcut, Icon }) => (
        <button
          key={id}
          type="button"
          className="aim-icon-button"
          aria-label={`${label} (${shortcut})`}
          title={`${label} — ${shortcut}`}
          aria-pressed={activeTool === id}
          onClick={() => onSelectTool?.(id)}
        >
          <Icon size={16} />
        </button>
      ))}
    </Island>
  );
}
