// Unit tests for the title-bar dirty indicator format (Phase 5 PR 3/3).

import { describe, expect, test } from "vitest";
import { buildDocumentTitle } from "./useDocumentTitle.js";

describe("buildDocumentTitle", () => {
  test("untitled, clean", () => {
    expect(buildDocumentTitle({ name: undefined, dirty: false })).toBe(
      "AI-Mindmap — Untitled",
    );
  });

  test("untitled, dirty shows the bullet", () => {
    expect(buildDocumentTitle({ name: undefined, dirty: true })).toBe(
      "AI-Mindmap — Untitled •",
    );
  });

  test("named file, clean", () => {
    expect(buildDocumentTitle({ name: "notes.aimap", dirty: false })).toBe(
      "AI-Mindmap — notes.aimap",
    );
  });

  test("named file, dirty", () => {
    expect(buildDocumentTitle({ name: "notes.aimap", dirty: true })).toBe(
      "AI-Mindmap — notes.aimap •",
    );
  });

  test("empty name string falls back to Untitled", () => {
    expect(buildDocumentTitle({ name: "", dirty: false })).toBe(
      "AI-Mindmap — Untitled",
    );
  });
});
