import { Menu } from "lucide-react";
import { Island } from "./Island.js";

export interface MainMenuProps {
  onClick?: () => void;
}

export function MainMenu({ onClick }: MainMenuProps) {
  return (
    <Island ariaLabel="Main menu">
      <button
        type="button"
        className="aim-icon-button aim-icon-button--lg"
        aria-label="Open main menu"
        title="Main menu"
        onClick={onClick}
      >
        <Menu size={18} />
      </button>
    </Island>
  );
}
