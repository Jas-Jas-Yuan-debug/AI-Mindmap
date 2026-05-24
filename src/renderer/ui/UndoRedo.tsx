import { Undo2, Redo2 } from "lucide-react";
import { Island } from "./Island.js";

export interface UndoRedoProps {
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function UndoRedo({
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: UndoRedoProps) {
  return (
    <Island className="aim-island--row" ariaLabel="Undo / Redo">
      <button
        type="button"
        className="aim-icon-button aim-icon-button--lg"
        aria-label="Undo"
        title="Undo — Cmd/Ctrl + Z"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className="aim-icon-button aim-icon-button--lg"
        aria-label="Redo"
        title="Redo — Cmd/Ctrl + Shift + Z"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 size={16} />
      </button>
    </Island>
  );
}
