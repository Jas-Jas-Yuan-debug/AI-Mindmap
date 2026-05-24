// Proves the jsdom environment is active for renderer-path tests.
// If this passes from a `node` env, environmentMatchGlobs is misconfigured.
// See vitest.config.ts and issue #9 Q5.
import { test, expect } from "vitest";

test("jsdom env provides a document for src/renderer/** tests", () => {
  expect(typeof document).toBe("object");
  const div = document.createElement("div");
  expect(div).toBeTruthy();
  expect(div.tagName).toBe("DIV");
});
