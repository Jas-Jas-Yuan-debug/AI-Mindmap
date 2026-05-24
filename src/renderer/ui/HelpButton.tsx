import { HelpCircle } from "lucide-react";
import { Island } from "./Island.js";

export interface HelpButtonProps {
  onClick?: () => void;
}

export function HelpButton({ onClick }: HelpButtonProps) {
  return (
    <Island ariaLabel="Help">
      <button
        type="button"
        className="aim-icon-button aim-icon-button--lg"
        aria-label="Open help and keyboard shortcuts"
        title="Help — ?"
        onClick={onClick}
      >
        <HelpCircle size={18} />
      </button>
    </Island>
  );
}
