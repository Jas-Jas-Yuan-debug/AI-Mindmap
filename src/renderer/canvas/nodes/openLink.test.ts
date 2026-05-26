import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeOpenableUrl, openLinkUrl } from "./openLink.js";

describe("normalizeOpenableUrl", () => {
  it("passes through https URLs", () => {
    expect(normalizeOpenableUrl("https://baidu.com")).toBe("https://baidu.com/");
    expect(normalizeOpenableUrl("https://example.com/a?b=1#c")).toBe(
      "https://example.com/a?b=1#c",
    );
  });

  it("passes through http URLs", () => {
    expect(normalizeOpenableUrl("http://example.com")).toBe("http://example.com/");
  });

  it("adds https:// to scheme-less hosts (the baidu.com bug)", () => {
    expect(normalizeOpenableUrl("baidu.com")).toBe("https://baidu.com/");
    expect(normalizeOpenableUrl("www.example.com/path")).toBe(
      "https://www.example.com/path",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeOpenableUrl("  https://example.com  ")).toBe(
      "https://example.com/",
    );
    expect(normalizeOpenableUrl("  example.com ")).toBe("https://example.com/");
  });

  it("rejects empty / whitespace-only input", () => {
    expect(normalizeOpenableUrl("")).toBeNull();
    expect(normalizeOpenableUrl("   ")).toBeNull();
  });

  it("rejects non-http(s) schemes", () => {
    expect(normalizeOpenableUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeOpenableUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeOpenableUrl("mailto:a@b.com")).toBeNull();
    expect(normalizeOpenableUrl("ftp://example.com")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(normalizeOpenableUrl(undefined as unknown as string)).toBeNull();
    expect(normalizeOpenableUrl(null as unknown as string)).toBeNull();
  });
});

describe("openLinkUrl", () => {
  const original = (window as unknown as { platform?: unknown }).platform;
  afterEach(() => {
    (window as unknown as { platform?: unknown }).platform = original;
  });

  it("calls platform.shell.openExternal with the normalized URL and returns true", () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { platform: unknown }).platform = {
      shell: { openExternal },
    };
    expect(openLinkUrl("baidu.com")).toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://baidu.com/");
  });

  it("returns false and does not call openExternal for a rejected URL", () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { platform: unknown }).platform = {
      shell: { openExternal },
    };
    expect(openLinkUrl("javascript:alert(1)")).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("does not throw when no platform adapter is present", () => {
    (window as unknown as { platform?: unknown }).platform = undefined;
    expect(() => openLinkUrl("https://example.com")).not.toThrow();
    // URL is valid, so an attempt is made (returns true) even with no adapter.
    expect(openLinkUrl("https://example.com")).toBe(true);
  });
});
