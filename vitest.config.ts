import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pick up tests in tests/unit/ (existing) AND co-located tests in src/.
    // Co-located tests let us assert renderer-shaped concerns (DOM, jsdom)
    // next to the code they cover — see src/renderer/jsdom-smoke.test.ts.
    include: [
      "tests/unit/**/*.test.ts",
      "src/**/*.test.{ts,tsx}",
    ],
    // Exclude macOS AppleDouble metadata sidecars that look like real files
    // to esbuild but contain binary xattr data.
    exclude: ["**/._*", "**/node_modules/**", "**/dist-*/**"],
    // Per issue #9 Q5: renderer tests need a DOM, shared/ tests don't.
    // environmentMatchGlobs flips the env based on file path so we don't
    // pay the jsdom startup cost on pure-data tests.
    environmentMatchGlobs: [
      ["src/renderer/**", "jsdom"],
      ["src/shared/**", "node"],
    ],
  },
});
