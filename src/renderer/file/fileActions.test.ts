// Unit tests for the File-menu actions (Phase 5 PR 2, sibling subagent B).
//
// These drive the action functions directly against the live Zustand stores
// and a fake `window.platform.files`, asserting the New / Open / Save /
// Save As / Recent flows wire the stores + handle correctly. No React render.
//
// NOTE(claude-jjy): the round-trip assertion (build a doc, save it, reopen it,
// fields preserved) exercises the renderer side of plan §6 "Round-trip ...
// byte-identical (modulo timestamps)" against the provisional aimap.ts shim.
// After sibling A's engine merges, this still passes against A's real
// toAimapFile / fromAimapFile (same documented shapes).

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  newDocument,
  openDocument,
  saveDocument,
  saveDocumentAs,
} from "./fileActions.js";
import { useNodes, type TextNode } from "../store/nodes.js";
import { useEdges, type Edge } from "../store/edges.js";
import { useViewport } from "../store/viewport.js";
import { useHistory } from "../store/history.js";
import { useDocument } from "../store/document.js";
import type {
  FileHandle,
  Platform,
  RecentFile,
} from "../../shared/platform.js";
import type { AimapFile } from "../../shared/aimap.js";

function makeHandle(name: string): FileHandle {
  return { _tag: "FileHandle", displayName: name } as FileHandle;
}

const sampleNode = (over: Partial<TextNode> = {}): TextNode => ({
  id: over.id ?? "n1",
  type: "text",
  x: over.x ?? 10,
  y: over.y ?? 20,
  width: over.width ?? 200,
  height: over.height ?? 80,
  text: over.text ?? "# Hello",
  ...over,
});

const sampleEdge = (over: Partial<Edge> = {}): Edge => ({
  id: over.id ?? "e1",
  fromNode: over.fromNode ?? "n1",
  toNode: over.toNode ?? "n2",
  ...over,
});

/** Build a fake platform whose file methods are spies the test can assert on. */
function fakePlatform(opts: {
  openResult?: { handle: FileHandle; data: AimapFile } | null;
  saveAsHandle?: FileHandle | null;
  recents?: RecentFile[];
}): {
  platform: Platform;
  saveCanvas: ReturnType<typeof vi.fn>;
  saveCanvasAs: ReturnType<typeof vi.fn>;
  openCanvas: ReturnType<typeof vi.fn>;
} {
  const saveCanvas = vi.fn(async () => {});
  const saveCanvasAs = vi.fn(async () => opts.saveAsHandle ?? null);
  const openCanvas = vi.fn(async () => opts.openResult ?? null);
  const recentFiles = vi.fn(async () => opts.recents ?? []);
  const platform = {
    kind: "web",
    files: { openCanvas, saveCanvas, saveCanvasAs, recentFiles },
  } as unknown as Platform;
  return { platform, saveCanvas, saveCanvasAs, openCanvas };
}

beforeEach(() => {
  useNodes.setState({ nodes: [] });
  useEdges.setState({ edges: [] });
  useViewport.getState().reset();
  useHistory.getState().clear();
  useDocument.setState({ currentFile: null, recentFiles: [] });
  // jsdom provides window; ensure no stale platform leaks across tests.
  delete (window as unknown as { platform?: Platform }).platform;
});

describe("newDocument", () => {
  test("clears nodes, edges, viewport, history, and current file", () => {
    useNodes.setState({ nodes: [sampleNode()] });
    useEdges.setState({ edges: [sampleEdge()] });
    useViewport.getState().setViewport({ x: 99, y: 88, zoom: 2 });
    useHistory.getState().capture();
    useDocument.getState().setCurrentFile(makeHandle("old.aimap"));

    newDocument();

    expect(useNodes.getState().nodes).toEqual([]);
    expect(useEdges.getState().edges).toEqual([]);
    expect(useViewport.getState()).toMatchObject({ x: 0, y: 0, zoom: 1 });
    expect(useHistory.getState().past).toEqual([]);
    expect(useDocument.getState().currentFile).toBeNull();
  });
});

describe("save → open round-trip", () => {
  test("Save As writes a doc that Open restores field-for-field", async () => {
    const nodes = [sampleNode({ id: "n1", text: "# A", color: "5" })];
    const edges = [sampleEdge({ id: "e1", fromNode: "n1", toNode: "n1", label: "loop" })];
    useNodes.setState({ nodes });
    useEdges.setState({ edges });
    useViewport.getState().setViewport({ x: 5, y: 6, zoom: 1.5 });

    // Capture whatever Save As hands to the platform.
    let written: AimapFile | undefined;
    const handle = makeHandle("doc.aimap");
    const saveCanvasAs = vi.fn(async (data: AimapFile) => {
      written = data;
      return handle;
    });
    const platform = {
      kind: "web",
      files: {
        openCanvas: vi.fn(),
        saveCanvas: vi.fn(),
        saveCanvasAs,
        recentFiles: vi.fn(async () => []),
      },
    } as unknown as Platform;
    (window as unknown as { platform: Platform }).platform = platform;

    await saveDocumentAs();

    expect(saveCanvasAs).toHaveBeenCalledOnce();
    expect(written).toBeDefined();
    expect(useDocument.getState().currentFile).toBe(handle);

    // Now wipe the live doc and re-open the written file.
    newDocument();
    expect(useNodes.getState().nodes).toEqual([]);

    const openPlatform = fakePlatform({
      openResult: { handle, data: written! },
    });
    (window as unknown as { platform: Platform }).platform =
      openPlatform.platform;

    await openDocument();

    expect(useNodes.getState().nodes).toEqual(nodes);
    expect(useEdges.getState().edges).toEqual(edges);
    expect(useViewport.getState()).toMatchObject({ x: 5, y: 6, zoom: 1.5 });
    expect(useDocument.getState().currentFile).toBe(handle);
  });
});

describe("saveDocument", () => {
  test("with a handle, writes back to it (no Save As dialog)", async () => {
    const handle = makeHandle("existing.aimap");
    useDocument.getState().setCurrentFile(handle);
    useNodes.setState({ nodes: [sampleNode()] });

    const { platform, saveCanvas, saveCanvasAs } = fakePlatform({});
    (window as unknown as { platform: Platform }).platform = platform;

    await saveDocument();

    expect(saveCanvas).toHaveBeenCalledOnce();
    expect(saveCanvas).toHaveBeenCalledWith(handle, expect.any(Object));
    expect(saveCanvasAs).not.toHaveBeenCalled();
  });

  test("without a handle, falls through to Save As", async () => {
    const newHandle = makeHandle("fresh.aimap");
    const { platform, saveCanvas, saveCanvasAs } = fakePlatform({
      saveAsHandle: newHandle,
    });
    (window as unknown as { platform: Platform }).platform = platform;

    await saveDocument();

    expect(saveCanvasAs).toHaveBeenCalledOnce();
    expect(saveCanvas).not.toHaveBeenCalled();
    expect(useDocument.getState().currentFile).toBe(newHandle);
  });
});

describe("open cancellation", () => {
  test("openCanvas returning null is a no-op", async () => {
    useNodes.setState({ nodes: [sampleNode()] });
    const { platform } = fakePlatform({ openResult: null });
    (window as unknown as { platform: Platform }).platform = platform;

    await openDocument();

    // Document untouched.
    expect(useNodes.getState().nodes).toHaveLength(1);
    expect(useDocument.getState().currentFile).toBeNull();
  });
});

describe("recent files cache", () => {
  test("refreshRecentFiles pulls from the platform", async () => {
    const recents: RecentFile[] = [
      { displayName: "a.aimap", lastOpenedAt: "2026-05-24T00:00:00Z" },
    ];
    const { platform } = fakePlatform({ recents });
    (window as unknown as { platform: Platform }).platform = platform;

    await useDocument.getState().refreshRecentFiles();

    expect(useDocument.getState().recentFiles).toEqual(recents);
  });
});
