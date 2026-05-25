import { describe, expect, it } from "vitest";
import {
  classifyDropFile,
  fitImageSize,
  isPasteableUrl,
  urlDisplayName,
  IMAGE_DEFAULT_MAX,
} from "./importClassify.js";

describe("classifyDropFile", () => {
  it("classifies by MIME type", () => {
    expect(classifyDropFile({ name: "x", type: "image/png" })).toBe("image");
    expect(classifyDropFile({ name: "x", type: "image/svg+xml" })).toBe("image");
    expect(classifyDropFile({ name: "doc.pdf", type: "application/pdf" })).toBe("file");
  });
  it("falls back to extension when type is missing", () => {
    expect(classifyDropFile({ name: "photo.JPG", type: "" })).toBe("image");
    expect(classifyDropFile({ name: "diagram.webp", type: "" })).toBe("image");
    expect(classifyDropFile({ name: "notes.txt", type: "" })).toBe("file");
    expect(classifyDropFile({ name: "noext", type: "" })).toBe("file");
  });
});

describe("isPasteableUrl", () => {
  it("accepts http(s) single-token urls", () => {
    expect(isPasteableUrl("https://anthropic.com")).toBe(true);
    expect(isPasteableUrl("  http://example.com/path?q=1  ")).toBe(true);
  });
  it("rejects non-http schemes, multi-token, and non-urls", () => {
    expect(isPasteableUrl("javascript:alert(1)")).toBe(false);
    expect(isPasteableUrl("data:text/plain,hi")).toBe(false);
    expect(isPasteableUrl("file:///etc/passwd")).toBe(false);
    expect(isPasteableUrl("just some text")).toBe(false);
    expect(isPasteableUrl("https://a.com and more")).toBe(false);
    expect(isPasteableUrl("")).toBe(false);
    expect(isPasteableUrl("not a url")).toBe(false);
  });
});

describe("fitImageSize", () => {
  it("leaves small images unscaled", () => {
    expect(fitImageSize(100, 80)).toEqual({ width: 100, height: 80 });
  });
  it("scales the longest side down to the max, preserving aspect", () => {
    const r = fitImageSize(1000, 500);
    expect(r.width).toBe(IMAGE_DEFAULT_MAX);
    expect(r.height).toBe(Math.round(IMAGE_DEFAULT_MAX / 2));
  });
  it("handles portrait orientation", () => {
    const r = fitImageSize(500, 1000);
    expect(r.height).toBe(IMAGE_DEFAULT_MAX);
    expect(r.width).toBe(Math.round(IMAGE_DEFAULT_MAX / 2));
  });
  it("guards zero/negative dimensions", () => {
    expect(fitImageSize(0, 0)).toEqual({ width: IMAGE_DEFAULT_MAX, height: IMAGE_DEFAULT_MAX });
  });
});

describe("urlDisplayName", () => {
  it("returns the host", () => {
    expect(urlDisplayName("https://www.anthropic.com/news")).toBe("www.anthropic.com");
  });
  it("returns the input on parse failure", () => {
    expect(urlDisplayName("not a url")).toBe("not a url");
  });
});
