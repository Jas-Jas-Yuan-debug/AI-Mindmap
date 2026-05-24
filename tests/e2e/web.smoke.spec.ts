import { test, expect } from "@playwright/test";

// Closes Phase 0 exit criterion:
//   "One web e2e test (Playwright Chromium) loads the app and asserts the same
//    rendering" (against the production web bundle served by `vite preview`).
// `webServer` in playwright.config.ts starts `npm run preview:web` on :4173.
// The chrome shell lives under `.aim-island` elements (see src/renderer/ui/Island.tsx
// and src/renderer/ui/Chrome.tsx); waiting for the first one to be visible
// verifies React mounted and Chrome rendered.

test("renders production web bundle with chrome shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".aim-island").first()).toBeVisible({ timeout: 5_000 });
});
