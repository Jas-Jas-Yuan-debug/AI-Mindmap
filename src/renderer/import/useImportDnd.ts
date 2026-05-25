// Phase 7 drag-drop + paste import.
//
// Attaches window-level listeners that turn OS drops and clipboard pastes
// into nodes:
//   - Drop image file(s)        → ImageNode (bitmap read as a data URL)
//   - Drop non-image file(s)    → FileNode (Electron: real path; web: name)
//   - Paste an image            → ImageNode
//   - Paste a single http(s) URL→ LinkNode (+ async metadata fetch)
//   - Paste other text          → ignored here (text-card creation stays on
//                                  double-click; we don't want every Cmd+V to
//                                  spawn a card and fight the in-app clipboard)
//
// New nodes are created at the drop cursor (screen→canvas via viewport); paste
// targets the viewport center. Each creation is one undo step.

import { useEffect } from "react";
import { useNodes, makeNodeId } from "../store/nodes.js";
import type { ImageNode, FileNode, LinkNode } from "../store/nodes.js";
import { useSelection } from "../store/selection.js";
import { useHistory } from "../store/history.js";
import { useViewport } from "../store/viewport.js";
import {
  classifyDropFile,
  fitImageSize,
  isPasteableUrl,
  urlDisplayName,
  FILE_NODE_SIZE,
  LINK_NODE_SIZE,
} from "./importClassify.js";

function screenToCanvas(clientX: number, clientY: number) {
  const v = useViewport.getState();
  return { x: Math.round((clientX - v.x) / v.zoom), y: Math.round((clientY - v.y) / v.zoom) };
}

export function viewportCenterCanvas() {
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  return screenToCanvas(w / 2, h / 2);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function addImageFromFile(file: File, at: { x: number; y: number }) {
  const dataUrl = await readAsDataUrl(file);
  const dims = await new Promise<{ width: number; height: number }>((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(fitImageSize(img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve(fitImageSize(0, 0));
    img.src = dataUrl;
  });
  const node: ImageNode = {
    id: makeNodeId(),
    type: "image",
    x: at.x,
    y: at.y,
    width: dims.width,
    height: dims.height,
    file: dataUrl,
    alt: file.name,
  };
  useHistory.getState().capture();
  useNodes.getState().addNode(node);
  useSelection.getState().select(node.id);
}

function addFileNode(name: string, path: string, at: { x: number; y: number }) {
  const node: FileNode = {
    id: makeNodeId(),
    type: "file",
    x: at.x,
    y: at.y,
    width: FILE_NODE_SIZE.width,
    height: FILE_NODE_SIZE.height,
    file: path,
    displayName: name,
  };
  useHistory.getState().capture();
  useNodes.getState().addNode(node);
  useSelection.getState().select(node.id);
}

export async function addLinkNode(url: string, at: { x: number; y: number }) {
  const node: LinkNode = {
    id: makeNodeId(),
    type: "link",
    x: at.x,
    y: at.y,
    width: LINK_NODE_SIZE.width,
    height: LINK_NODE_SIZE.height,
    url,
    title: urlDisplayName(url),
  };
  useHistory.getState().capture();
  useNodes.getState().addNode(node);
  useSelection.getState().select(node.id);

  // Best-effort metadata enrichment (Electron fetches; web returns null).
  // Failure is silent — the node already shows the host as its title.
  try {
    const meta = await window.platform?.links?.fetchMeta(url);
    if (meta) {
      useNodes.getState().updateNode(node.id, {
        ...(meta.title ? { title: meta.title } : {}),
        ...(meta.favicon ? { favicon: meta.favicon } : {}),
      });
    }
  } catch {
    // ignore — host-name title stands
  }
}

export function useImportDnd() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      e.preventDefault();
    };

    const onDrop = (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      e.preventDefault();
      let at = screenToCanvas(e.clientX, e.clientY);
      for (const file of Array.from(files)) {
        if (classifyDropFile(file) === "image") {
          void addImageFromFile(file, at);
        } else {
          // Electron exposes the real path on the File object; web has none.
          const path = (file as File & { path?: string }).path ?? file.name;
          addFileNode(file.name, path, at);
        }
        // Cascade subsequent drops so multiple files don't stack exactly.
        at = { x: at.x + 24, y: at.y + 24 };
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      // Don't hijack paste while typing in an input/textarea/contentEditable.
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      const dt = e.clipboardData;
      if (!dt) return;
      // Image first.
      for (const item of Array.from(dt.items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void addImageFromFile(file, viewportCenterCanvas());
            return;
          }
        }
      }
      // Then a single URL.
      const text = dt.getData("text/plain");
      if (text && isPasteableUrl(text)) {
        e.preventDefault();
        void addLinkNode(text.trim(), viewportCenterCanvas());
      }
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, []);
}
