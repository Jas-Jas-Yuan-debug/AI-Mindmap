import "./Chrome.css";
import { MainMenu } from "./MainMenu.js";
import { Toolbar } from "./Toolbar.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { ZoomControls } from "./ZoomControls.js";
import { UndoRedo } from "./UndoRedo.js";
import { HelpButton } from "./HelpButton.js";
import { StatusBar } from "./StatusBar.js";

// The floating chrome layer that sits over the canvas. Mirrors Excalidraw's
// LayerUI / FixedSideContainer pattern: wrapper has pointer-events: none so
// the canvas underneath stays interactive; each Island re-enables pointer
// events on itself.
export function Chrome() {
  return (
    <div className="aim-chrome" aria-label="App chrome">
      <div className="aim-chrome__row aim-chrome__row--top">
        <div className="aim-chrome__col aim-chrome__col--start">
          <MainMenu />
        </div>
        <div className="aim-chrome__col aim-chrome__col--center">
          <Toolbar />
        </div>
        <div className="aim-chrome__col aim-chrome__col--end">
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
          <HelpButton />
        </div>
      </div>
    </div>
  );
}
