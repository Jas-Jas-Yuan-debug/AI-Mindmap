// Konva renderer for a FileNode: a rounded card showing a generic file glyph
// + the file's display name. Double-click opens the file in the OS default
// app via `window.platform.shell.openPath`.

import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Rect, Text, Path } from "react-konva";
import type { FileNode } from "../../store/nodes.js";
import { useNodeDrag } from "./useNodeDrag.js";
import { useResolvedTheme } from "../../theme/useResolvedTheme.js";
import { resolveNodeStyle } from "./nodeStyle.js";
import { useViewport } from "../../store/viewport.js";

// A simple document glyph (lucide-ish "file" outline), drawn at 20x20 and
// translated into the card's left padding.
const FILE_GLYPH =
  "M4 2 H12 L16 6 V18 a1 1 0 0 1 -1 1 H4 a1 1 0 0 1 -1 -1 V3 a1 1 0 0 1 1 -1 Z M12 2 V6 H16";

export interface FileNodeBoxProps {
  node: FileNode;
  selected: boolean;
  onSelect?: (e: KonvaEventObject<MouseEvent>) => void;
}

export function FileNodeBox({ node, selected, onSelect }: FileNodeBoxProps) {
  const drag = useNodeDrag(node.id);
  const zoom = useViewport((s) => s.zoom);
  const theme = useResolvedTheme();
  const style = resolveNodeStyle(node, theme, "file");
  const label = node.displayName || node.file.split("/").pop() || node.file;

  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};

  const open = () => {
    // Only meaningful for file-path-backed nodes (Electron). On web the path
    // is a display name; openPath is a no-op there.
    void window.platform?.shell.openPath(node.file);
  };

  return (
    <Group
      x={node.x}
      y={node.y}
      name="file-node"
      id={node.id}
      draggable
      opacity={style.opacity}
      onDragStart={drag.onDragStart}
      onDragMove={drag.onDragMove}
      onDragEnd={drag.onDragEnd}
      onDblClick={open}
      onDblTap={open}
      {...pointerHandlers}
    >
      <Rect
        width={node.width}
        height={node.height}
        cornerRadius={style.cornerRadius}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        {...(style.dash ? { dash: style.dash } : {})}
        strokeScaleEnabled={false}
      />
      {selected ? (() => {
        const ringOffset = 4 / zoom;
        return (
          <Rect
            x={-ringOffset}
            y={-ringOffset}
            width={node.width + ringOffset * 2}
            height={node.height + ringOffset * 2}
            cornerRadius={style.cornerRadius + ringOffset}
            stroke="#6965db"
            strokeWidth={2}
            strokeScaleEnabled={false}
            fillEnabled={false}
            listening={false}
          />
        );
      })() : null}
      <Group x={14} y={node.height / 2 - 10}>
        <Path data={FILE_GLYPH} stroke={style.fontColor} strokeWidth={1.5} />
      </Group>
      <Text
        x={44}
        y={0}
        width={node.width - 56}
        height={node.height}
        text={label}
        fontSize={14}
        fontFamily="system-ui, sans-serif"
        fill={style.fontColor}
        align="left"
        verticalAlign="middle"
        ellipsis
        wrap="none"
        listening={false}
      />
    </Group>
  );
}

export default FileNodeBox;
