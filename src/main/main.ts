import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { registerFileHandlers } from "./ipc/files.js";
import { registerEmbedHandlers } from "./ipc/embeds.js";
import { registerAiHandlers } from "./ipc/ai.js";

const DEV_URL = process.env.AIM_DEV_URL;
const isDev = !!DEV_URL;

let mainWindow: BrowserWindow | null = null;

// Phase 5 PR 3/3: the renderer reports its dirty flag here so we can guard the
// window close. `forceClose` lets the confirmed-close path bypass the guard.
let documentDirty = false;
let forceClose = false;
let confirmSeq = 0;

ipcMain.on("window:dirtyChanged", (_e, dirty: boolean) => {
  documentDirty = Boolean(dirty);
});

/**
 * Ask the renderer to run its in-app save/discard prompt and tell us whether to
 * proceed with the close. Resolves false (keep open) if the renderer doesn't
 * answer within a short window — a stuck renderer must not strand the user, but
 * we also won't silently discard unsaved work.
 */
function confirmCloseWithRenderer(win: BrowserWindow): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const id = ++confirmSeq;
    const replyChannel = `window:confirmClose:reply:${id}`;
    let settled = false;
    const finish = (proceed: boolean) => {
      if (settled) return;
      settled = true;
      ipcMain.removeAllListeners(replyChannel);
      resolve(proceed);
    };
    ipcMain.once(replyChannel, (_e, proceed: boolean) => finish(Boolean(proceed)));
    win.webContents.send("window:confirmClose", id);
    // Safety valve: if the renderer never replies, keep the window open.
    setTimeout(() => finish(false), 15000);
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev && DEV_URL) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  // Intercept close while the document is dirty: defer to the renderer's
  // save/discard prompt (so the user gets the themed modal, not a native one),
  // then close only if they chose to proceed.
  mainWindow.on("close", (e) => {
    if (forceClose || !documentDirty || !mainWindow) return;
    e.preventDefault();
    const win = mainWindow;
    void confirmCloseWithRenderer(win).then((proceed) => {
      if (proceed) {
        forceClose = true;
        win.close();
      }
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    documentDirty = false;
    forceClose = false;
  });
}

app.whenReady().then(() => {
  registerFileHandlers();
  registerEmbedHandlers();
  registerAiHandlers();
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
