import { Minus, Plus } from "lucide-react";
import { Island } from "./Island.js";

export interface ZoomControlsProps {
  zoom?: number; // 1.0 = 100%
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
}

export function ZoomControls({
  zoom = 1,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: ZoomControlsProps) {
  const pct = Math.round(zoom * 100);
  return (
    <Island className="aim-island--row" ariaLabel="Zoom">
      <button
        type="button"
        className="aim-icon-button aim-icon-button--lg"
        aria-label="Zoom out"
        title="Zoom out — Cmd/Ctrl + -"
        onClick={onZoomOut}
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        className="aim-icon-button aim-icon-button--lg"
        aria-label={`Zoom: ${pct}%, click to reset`}
        title="Reset zoom — Cmd/Ctrl + 0"
        onClick={onZoomReset}
        style={{ width: "auto", padding: "0 0.5rem", fontVariantNumeric: "tabular-nums" }}
      >
        {pct}%
      </button>
      <button
        type="button"
        className="aim-icon-button aim-icon-button--lg"
        aria-label="Zoom in"
        title="Zoom in — Cmd/Ctrl + ="
        onClick={onZoomIn}
      >
        <Plus size={16} />
      </button>
    </Island>
  );
}
