// Unit tests for the corrupt-file error → friendly message mapping
// (Phase 5 PR 3/3, sibling C). Plan §6 Phase 5 exit criterion: corrupt JSON
// shows a generic message; partial-corrupt (valid JSON, fails Zod) shows the
// specific field path + reason.

import { describe, expect, test } from "vitest";
import { friendlyFileError } from "./fileErrorMessage.js";

describe("friendlyFileError — open", () => {
  test("invalid JSON → generic 'not a valid .aimap file', no detail", () => {
    const e = friendlyFileError(
      "open",
      "Unexpected token } in JSON at position 42",
    );
    expect(e.title).toBe("Can't open file");
    expect(e.body).toBe("This file isn't a valid .aimap file.");
    expect(e.detail).toBeUndefined();
  });

  test("'Unexpected end of JSON input' is treated as invalid JSON", () => {
    const e = friendlyFileError("open", "Unexpected end of JSON input");
    expect(e.body).toBe("This file isn't a valid .aimap file.");
    expect(e.detail).toBeUndefined();
  });

  test("Zod-invalid (valid JSON) surfaces the specific field path + message", () => {
    const raw =
      "Document failed validation after migration: Invalid .aimap file: nodes.0.width: Expected number, received string";
    const e = friendlyFileError("open", raw);
    expect(e.title).toBe("Can't open file");
    // The envelope is stripped; the field path + reason is shown verbatim.
    expect(e.detail).toBe("nodes.0.width: Expected number, received string");
  });

  test("missing-formatVersion migration error shows its detail", () => {
    const raw =
      "Document is missing an integer 'formatVersion'; cannot determine how to load it.";
    const e = friendlyFileError("open", raw);
    expect(e.detail).toContain("formatVersion");
  });
});

describe("friendlyFileError — save", () => {
  test("save errors get an honest generic message + detail", () => {
    const e = friendlyFileError("save", "EACCES: permission denied");
    expect(e.title).toBe("Can't save file");
    expect(e.detail).toBe("EACCES: permission denied");
  });
});
