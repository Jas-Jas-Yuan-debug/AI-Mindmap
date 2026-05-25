import "./Chrome.css";
import { MainMenu } from "./MainMenu.js";
import { Toolbar } from "./Toolbar.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { ZoomControls } from "./ZoomControls.js";
import { UndoRedo } from "./UndoRedo.js";
import { HelpButton } from "./HelpButton.js";
import { StatusBar } from "./StatusBar.js";
import { MessageSquare } from "lucide-react";
import { Island } from "./Island.js";
import { usePanels } from "../store/panels.js";
import { useChat } from "../store/chat.js";
import { useTool } from "../store/tool.js";
import { selectTool } from "./toolActions.js";

// The floating chrome layer that sits over the canvas. Mirrors Excalidraw's
// LayerUI / FixedSideContainer pattern: wrapper has pointer-events: none so
// the canvas underneath stays interactive; each Island re-enables pointer
// events on itself.
export function Chrome() {
  const showCheatSheet = usePanels((s) => s.show);
  const toggleChat = useChat((s) => s.toggle);
  const activeTool = useTool((s) => s.activeTool);
  return (
    <div className="aim-chrome" aria-label="App chrome">
      <div className="aim-chrome__row aim-chrome__row--top">
        <div className="aim-chrome__col aim-chrome__col--start">
          <MainMenu />
        </div>
        <div className="aim-chrome__col aim-chrome__col--center">
          <Toolbar activeTool={activeTool} onSelectTool={selectTool} />
        </div>
        <div className="aim-chrome__col aim-chrome__col--end aim-chrome__col--gap">
          <Island ariaLabel="Chat">
            <button
              type="button"
              className="aim-icon-button aim-icon-button--lg"
              aria-label="Toggle AI chat"
              title="AI chat"
              onClick={toggleChat}
            >
              <MessageSquare size={16} />
            </button>
          </Island>
          <ThemeToggle />
        </div>
      </div>

      <div className="aim-chrome__row aim-chrome__row--bottom">
        <div className="aim-chrome__col aim-chrome__col--start aim-chrome__col--gap">
          <ZoomControls />
          <UndoRedo />
        </div>
        <div className="aim-chrome__col aim-chrome__col--center" />
        <div className="aim-chrome__col aim-chrome__col--end aim-chrome__col--gap">
          <StatusBar />
          <HelpButton onClick={() => showCheatSheet("cheatsheet")} />
        </div>
      </div>
    </div>
  );
}
