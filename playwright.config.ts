import { defineConfig, devices } from "@playwright/test";

// Playwright config for Phase 0 e2e coverage.
// - electron project: launches the built Electron app and asserts the window title.
// - web-chromium project: drives Vite preview (production web bundle) and asserts UI render.
// Kept `fullyParallel: false` because Electron projects shouldn't open multiple windows concurrently.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  reporter: "list",
  fullyParallel: false,
  projects: [
    {
      name: "electron",
      testMatch: /electron\.smoke\.spec\.ts/,
    },
    {
      name: "web-chromium",
      testMatch: /web\.smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:4173",
      },
    },
  ],
  webServer: {
    command: "npm run preview:web",
    url: "http://localhost:4173",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
