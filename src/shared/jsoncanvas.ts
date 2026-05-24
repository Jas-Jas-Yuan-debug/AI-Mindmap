// JSON Canvas 1.0 — https://jsoncanvas.org/spec/1.0/
// Native file format for .canvas files (Obsidian-compatible).
// Field names MUST match the spec exactly. Do not rename.

export type HexColor = `#${string}`;
export type CanvasPresetColor = "1" | "2" | "3" | "4" | "5" | "6";
//  "1" red | "2" orange | "3" yellow | "4" green | "5" cyan | "6" purple
export type CanvasColor = HexColor | CanvasPresetColor;

export type NodeType = "text" | "file" | "link" | "group";
export type EdgeSide = "top" | "right" | "bottom" | "left";
export type EdgeEnd = "none" | "arrow";
export type GroupBackgroundStyle = "cover" | "ratio" | "repeat";

export interface NodeBase {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
}

export interface TextNode extends NodeBase {
  type: "text";
  text: string;
}

export interface FileNode extends NodeBase {
  type: "file";
  file: string;
  subpath?: string;
}

export interface LinkNode extends NodeBase {
  type: "link";
  url: string;
}

export interface GroupNode extends NodeBase {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: GroupBackgroundStyle;
}

export type Node = TextNode | FileNode | LinkNode | GroupNode;

export interface Edge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
  fromEnd?: EdgeEnd;
  toEnd?: EdgeEnd;
  color?: CanvasColor;
  label?: string;
}

export interface JSONCanvas {
  nodes?: Node[];
  edges?: Edge[];
}
