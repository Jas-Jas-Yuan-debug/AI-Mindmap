import { Minus, Plus } from "lucide-react";
import { Island } from "./Island.js";
import { useViewport } from "../store/viewport.js";

// ZoomControls — bottom-left zoom Island. Subscribes directly to the
// viewport store; Phase 1 PR 2 wires this up. The optional props let
// tests (or a future host) override the binding, but in normal use the
// component reads/writes the store on its own.

const KEY_ZOOM_FACTOR = 1.25;

export interface ZoomControlsProps {
  /** Override displayed zoom (1.0 = 100%). Defaults to the store value. */
  zoom?: number;
  /** Override the zoom-in handler. Defaults to setZoom(zoom * 1.25). */
  onZoomIn?: () => void;
  /** Override the zoom-out handler. Defaults to setZoom(zoom / 1.25). */
  onZoomOut?: () => void;
  /** Override the reset handler. Defaults to viewport.reset(). */
  onZoomReset?: () => void;
}

export function ZoomControls(props: ZoomControlsProps = {}) {
  const storeZoom = useViewport((s) => s.zoom);
  const setZoom = useViewport((s) => s.setZoom);
  const reset = useViewport((s) => s.reset);

  const zoom = props.zoom ?? storeZoom;
  const pct = Math.round(zoom * 100);

  const onZoomIn = props.onZoomIn ?? (() => setZoom(zoom * KEY_ZOOM_FACTOR));
  const onZoomOut = props.onZoomOut ?? (() => setZoom(zoom / KEY_ZOOM_FACTOR));
  const onZoomReset = props.onZoomReset ?? reset;

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
