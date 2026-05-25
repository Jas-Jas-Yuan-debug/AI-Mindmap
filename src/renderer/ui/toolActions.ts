// Toolbar tool selection. "text"/"group"/"edge"/"select" arm a canvas mode;
// "image"/"link" are instant one-shot actions (open a picker / prompt a URL),
// after which we revert to the select tool.

import { useTool, type Tool } from "../store/tool.js";
import {
  addImageFromFile,
  addLinkNode,
  viewportCenterCanvas,
} from "../import/useImportDnd.js";

function pickImage(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void addImageFromFile(file, viewportCenterCanvas());
    input.remove();
  };
  document.body.appendChild(input);
  input.click();
}

function promptLink(): void {
  const url = window.prompt("Paste a link URL:");
  const trimmed = url?.trim();
  if (trimmed && /^https?:\/\//i.test(trimmed)) {
    void addLinkNode(trimmed, viewportCenterCanvas());
  }
}

export function selectTool(t: Tool): void {
  if (t === "image") {
    pickImage();
    useTool.getState().setTool("select");
    return;
  }
  if (t === "link") {
    promptLink();
    useTool.getState().setTool("select");
    return;
  }
  useTool.getState().setTool(t);
}
