// Konva renderer for a LinkNode: a rounded card showing the page title (or
// host fallback) + the URL, with an optional favicon. Double-click opens the
// URL in the OS browser via `window.platform.shell.openExternal`.

import { useEffect, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Rect, Text, Image as KonvaImage } from "react-konva";
import type { LinkNode } from "../../store/nodes.js";
import { urlDisplayName } from "../../import/importClassify.js";
import { useNodeDrag } from "./useNodeDrag.js";
// NOTE(A): colors only — theme-aware fill/stroke/text. Sibling D owns the
// onDblClick / open-URL behavior; left untouched.
import { useResolvedTheme } from "../../theme/useResolvedTheme.js";
import { resolveNodeStyle } from "./nodeStyle.js";

const SELECTED_BORDER_COLOR = "#6965db";
// URL line keeps the brand link color across themes (reads as a hyperlink).
const URL_LINK_COLOR = "#6965db";

function useFavicon(src: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src || typeof window === "undefined") {
      setImg(null);
      return;
    }
    const el = new window.Image();
    let live = true;
    el.onload = () => live && setImg(el);
    el.onerror = () => live && setImg(null);
    el.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return img;
}

export interface LinkNodeBoxProps {
  node: LinkNode;
  selected: boolean;
  onSelect?: (e: KonvaEventObject<MouseEvent>) => void;
}

export function LinkNodeBox({ node, selected, onSelect }: LinkNodeBoxProps) {
  const drag = useNodeDrag(node.id);
  const favicon = useFavicon(node.favicon);
  const theme = useResolvedTheme();
  const style = resolveNodeStyle(node, theme, "link");
  const title = node.title || urlDisplayName(node.url);

  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};

  const open = () => {
    void window.platform?.shell.openExternal(node.url);
  };

  const hasIcon = Boolean(favicon);
  const textLeft = hasIcon ? 40 : 16;

  return (
    <Group
      x={node.x}
      y={node.y}
      name="link-node"
      id={node.id}
      draggable
      opacity={style.opacity}
      onDragStart={drag.onDragStart}
      onDragMove={drag.onDragMove}
      onDragEnd={drag.onDragEnd}
      // NOTE(A): colors only — open-on-dblclick is sibling D's; left as-is.
      onDblClick={open}
      onDblTap={open}
      {...pointerHandlers}
    >
      <Rect
        width={node.width}
        height={node.height}
        cornerRadius={style.cornerRadius}
        fill={style.fill}
        stroke={selected ? SELECTED_BORDER_COLOR : style.stroke}
        strokeWidth={selected ? 2 : style.strokeWidth}
        {...(!selected && style.dash ? { dash: style.dash } : {})}
        strokeScaleEnabled={false}
      />
      {favicon ? (
        <KonvaImage image={favicon} x={14} y={16} width={16} height={16} listening={false} />
      ) : null}
      <Text
        x={textLeft}
        y={14}
        width={node.width - textLeft - 12}
        text={title}
        fontSize={14}
        fontStyle="bold"
        fontFamily="system-ui, sans-serif"
        fill={style.fontColor}
        ellipsis
        wrap="none"
        listening={false}
      />
      <Text
        x={16}
        y={node.height - 28}
        width={node.width - 28}
        text={node.url}
        fontSize={12}
        fontFamily="system-ui, sans-serif"
        fill={URL_LINK_COLOR}
        ellipsis
        wrap="none"
        listening={false}
      />
    </Group>
  );
}

export default LinkNodeBox;
