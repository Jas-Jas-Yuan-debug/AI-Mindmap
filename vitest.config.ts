import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    // Exclude macOS AppleDouble metadata sidecars that look like real files
    // to esbuild but contain binary xattr data.
    exclude: ["**/._*", "**/node_modules/**", "**/dist-*/**"],
  },
});
