import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

// Closes Phase 0 exit criterion:
//   "One Electron e2e test launches the app and asserts the window title".
// Uses Playwright's built-in `_electron` API (no legacy playwright-electron pkg).
// Launches the built app from `dist-electron/main/main.js` via `electron .`
// (resolves through the repo `package.json` `main` field).

let app: ElectronApplication;
let firstWindow: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: ["."],
    env: { ...process.env, NODE_ENV: "test" },
  });
  firstWindow = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
});

test("window title contains AI-Mindmap", async () => {
  const title = await firstWindow.title();
  expect(title).toMatch(/AI-Mindmap/i);
});
