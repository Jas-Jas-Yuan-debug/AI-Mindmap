import { describe, expect, it } from "vitest";
import { classifyError, MissingKeyError } from "./errors.js";

describe("classifyError", () => {
  it("maps MissingKeyError → no_key", () => {
    expect(classifyError(new MissingKeyError()).kind).toBe("no_key");
  });

  it("maps a plain Error → unknown, preserving the message", () => {
    const r = classifyError(new Error("boom"));
    expect(r.kind).toBe("unknown");
    expect(r.message).toBe("boom");
  });

  it("maps a non-Error throw → unknown", () => {
    expect(classifyError("nope").kind).toBe("unknown");
    expect(classifyError("nope").message).toBe("nope");
  });
});
